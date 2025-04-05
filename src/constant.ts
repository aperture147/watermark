export const ROBOTS_TXT = `# Allow search engine bots
User-agent: Googlebot
Allow: /
User-agent: Bingbot
Allow: /
User-agent: Baiduspider
Allow: /
User-agent: YandexBot
Allow: /
User-agent: NaverBot
Allow: /
User-agent: DuckDuckBot
Allow: /
User-agent: Applebot
Allow: /
User-agent: seznambot
Allow: /
User-agent: msnbot
Allow: /
User-agent: Slurp
Allow: /

# Allow social media bots
User-agent: facebookexternalhit
Allow: /
User-agent: Twitterbot
Allow: /
User-agent: LinkedInBot
Allow: /
User-agent: Discordbot
Allow: /
User-agent: Pinterestbot
Allow: /
User-agent: TelegramBot
Allow: /

# Allow SEO tools
User-agent: Screaming Frog SEO Spider
Allow: /

# Disallow all bots
User-agent: *
Disallow: /
`

export const FAVICON_SET = new Set([
	'android-chrome-192x192.png',
	'android-chrome-512x512.png',
	'apple-touch-icon.png',
	'favicon-16x16.png',
	'favicon-32x32.png',
	'favicon.ico',
	'site.webmanifest'
])

export const CACHE_CONTROL_VALUE = 'public, max-age=31536000, s-maxage=31536000'