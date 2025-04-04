import { PhotonImage, watermark, resize } from "@cf-wasm/photon";
import { env } from "cloudflare:workers";

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
		// await fetch("https://images.pexels.com/photos/2559941/pexels-photo-2559941.jpeg?w=1280&h=853").then(resp => env.R2_IMAGES.put("test2.jpg", resp.body))
		const url = new URL(request.url);
		
		const objectKey = url.pathname.replace(TRIMMING_SLASH_REGEX, '').replace(/\/{2,}/, '/')
		if (!objectKey) {
			return new Response('No object key provided', { status: 400 });
		}

		const cache = caches.default
		const cacheKey = `http://localhost/${objectKey}`
		let cachedResp = await cache.match(cacheKey, { ignoreMethod: true })

		if (cachedResp && cachedResp.ok) return cachedResp;

		const imageObject = await env.R2_IMAGES.get(objectKey)
		if (!imageObject) {
			return new Response('Image not found', { status: 404 });
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
				'Cache-Control': 'public, max-age=31536000, s-maxage=31536000',
			},
		})
		ctx.waitUntil(new Promise(async () => {
			await cache.put(cacheKey, finalResponse.clone())
			image.free()
		}))
		return finalResponse;
	},
} satisfies ExportedHandler<Env>;
