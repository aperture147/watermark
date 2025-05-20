import { PhotonImage, watermark, resize } from "@cf-wasm/photon";
import { env } from "cloudflare:workers";
import { CACHE_CONTROL_VALUE, FAVICON_SET, ONE_MEBIBYTES, ROBOTS_TXT, TRIMMING_SLASH_REGEX } from "./constant"

let WATERMARK_IMAGE: PhotonImage | null = null
let WATERMARK_WIDTH = 0
let WATERMARK_HEIGHT = 0
let WATERMARK_RATIO = 0

const getWatermarkImage = async (watermarkKey: string = 'watermark') => {
	if (!WATERMARK_IMAGE) {
		const logoResp = await env.ASSETS.fetch(`http://asset.local/${watermarkKey}.png`)
		WATERMARK_IMAGE = PhotonImage.new_from_byteslice(await logoResp.bytes())
		WATERMARK_WIDTH = WATERMARK_IMAGE.get_width()
		WATERMARK_HEIGHT = WATERMARK_IMAGE.get_height()
		WATERMARK_RATIO = WATERMARK_HEIGHT / WATERMARK_WIDTH
	}
	return WATERMARK_IMAGE
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		
		const objectKey = url.pathname.replace(TRIMMING_SLASH_REGEX, '')
		if (!objectKey) {
			return new Response('No object key provided', { status: 400 });
		}

		if (objectKey === 'robots.txt') {
			return new Response(ROBOTS_TXT, {
				headers: {
					'Content-Type': 'text/plain',
				}
			});
		}

		const cacheKey = `http://image.local/${objectKey}?version=${env.CACHE_VERSION}}`
		const cache = caches.default
	
		const cachedResp = await cache.match(cacheKey, { ignoreMethod: true })
		if (cachedResp && cachedResp.ok) return cachedResp;

		const imageObject = await env.R2_IMAGES.get(objectKey)
		if (!imageObject) {
			return new Response('Not found', { status: 404 });
		}
		
		if (FAVICON_SET.has(objectKey)) {
			const resp = new Response(imageObject.body, {
				headers: {		
					'Cache-Control': CACHE_CONTROL_VALUE
				}
			})
			ctx.waitUntil(cache.put(cacheKey, resp.clone()))
			return resp
		}

		if (imageObject.size > 5 * ONE_MEBIBYTES) {
			const resp = new Response(imageObject.body, {
				headers: {
					'Content-Type': imageObject.httpMetadata?.contentType ?? 'image/jpeg',
					'Cache-Control': CACHE_CONTROL_VALUE,
				},
			})

			ctx.waitUntil(cache.put(cacheKey, resp.clone()))
			return resp
		}
		
		try {
			const image = PhotonImage.new_from_byteslice(new Uint8Array(await imageObject.arrayBuffer()))
			const imageWidth = image.get_width()
			const imageHeight = image.get_height()
			const sourceWatermarkImage = await getWatermarkImage(url.hostname)
			let referenceWidth = imageWidth > imageHeight ? imageHeight : imageWidth
			let offOffsetX = 0
			if (imageWidth > imageHeight) {
				referenceWidth = imageHeight
				offOffsetX = Math.trunc((imageWidth - imageHeight) / 2)
			}
			let watermarkWidth = Math.trunc(referenceWidth * 0.4)
			const newWatermarkRatio = watermarkWidth / WATERMARK_WIDTH
			let watermarkHeight = Math.trunc(newWatermarkRatio * WATERMARK_HEIGHT)
			if (newWatermarkRatio < 0.9 || newWatermarkRatio > 1.1) {
				const watermarkImage = resize(
					sourceWatermarkImage,
					watermarkWidth, watermarkHeight,
					5
				)
				let offsetX = imageWidth - watermarkImage.get_width() - offOffsetX
				let offsetY = imageHeight - watermarkImage.get_height()

				watermark(
					image, watermarkImage, 
					BigInt(offsetX),
					BigInt(offsetY),
				)
				watermarkImage.free()
			} else {
				let offsetX = imageWidth - WATERMARK_WIDTH - offOffsetX
				let offsetY = imageHeight - WATERMARK_HEIGHT
				
				watermark(
					image, sourceWatermarkImage, 
					BigInt(offsetX),
					BigInt(offsetY),
				)
			}
			
			const finalResponse = new Response(image.get_bytes_jpeg(70), {
				headers: {
					'Content-Type': 'image/jpeg',
					'Cache-Control': CACHE_CONTROL_VALUE,
				},
			})
			image.free()

			ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()))

			return finalResponse;
		} catch (e) {
			if (!(e instanceof WebAssembly.RuntimeError)) {
				throw e
			}
			if (e.message.includes('unreachable')) {
				return new Response('Failed to process the image, please contact administators to resolve this problem', { status: 500 });
			}
		}
		return new Response('Unexpected error', { status: 504 });
	},
} satisfies ExportedHandler<Env>;
