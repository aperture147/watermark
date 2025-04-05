import { PhotonImage, watermark, resize } from "@cf-wasm/photon";
import { env } from "cloudflare:workers";
import { CACHE_CONTROL_VALUE, FAVICON_SET, ROBOTS_TXT } from "./constant"

const TRIMMING_SLASH_REGEX = /^\/+|\/+$/g;

let WATERMARK_IMAGE: PhotonImage | null = null
let WATERMARK_WIDTH = 0
let WATERMARK_HEIGHT = 0
let WATERMARK_RATIO = 0

const getWatermarkImage = async () => {
	if (!WATERMARK_IMAGE) {
		const logoResp = await env.ASSETS.fetch('http://localhost/watermark.png')
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

		const cacheKey = `http://localhost/${objectKey}`
		const cache = caches.default

		let cachedResp = await cache.match(cacheKey, { ignoreMethod: true })
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

		const image = PhotonImage.new_from_byteslice(new Uint8Array(await imageObject.arrayBuffer()))
		const imageWidth = image.get_width()
		const imageHeight = image.get_height()

		let watermarkImage = await getWatermarkImage()
		let watermarkWidth = imageHeight * 0.3
		let watermarkHeight = WATERMARK_RATIO * watermarkWidth
		const newWatermarkWidthRatio = watermarkWidth / WATERMARK_WIDTH
		
		if (newWatermarkWidthRatio < 0.9 || newWatermarkWidthRatio > 1.1) {
			watermarkImage = resize(watermarkImage, watermarkWidth, watermarkHeight, 1)
		} else {
			watermarkHeight = WATERMARK_HEIGHT
			watermarkWidth = WATERMARK_WIDTH
		}
		
		watermark(
			image, watermarkImage, 
			BigInt(Math.trunc(imageWidth - watermarkWidth)),
			BigInt(Math.trunc(imageHeight - watermarkHeight)),
		)
		
		const finalResponse = new Response(image.get_bytes_webp(), {
			headers: {
				'Content-Type': 'image/webp',
				'Cache-Control': CACHE_CONTROL_VALUE,
			},
		})
		ctx.waitUntil(new Promise(async () => {
			await cache.put(cacheKey, finalResponse.clone())
			image.free()
		}))
		return finalResponse;
	},
} satisfies ExportedHandler<Env>;
