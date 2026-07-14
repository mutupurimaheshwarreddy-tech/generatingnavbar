import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '@/lib/prisma';

cloudinary.config({
  cloud_name: 'dyn40clci',
  api_key: '328476136325637',
  api_secret: 'a7MiQt_aMZfhuCe2891nUdgJDVs',
});

const BANNED_KEYWORDS = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'google', 'placeholder', 'spinner'];

async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: 'logos',
        overwrite: true,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed"));

        const optimizedUrl = result.secure_url.replace(
          '/upload/',
          '/upload/e_make_transparent:15,co_white/e_trim/f_avif,q_auto/'
        );
        resolve(optimizedUrl);
      }
    );
    uploadStream.end(buffer);
  });
}

// ---------------------------------------------------------
// THE NEW, HIGHLY INTELLIGENT LOGO EXTRACTOR
// ---------------------------------------------------------
async function extractLogoUrlFromWebsite(websiteUrl: string, domain: string): Promise<string | null> {
  try {
    const secureUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    const baseUrlNoSlash = secureUrl.replace(/\/$/, '');

    const response = await fetch(secureUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000) // 8-second timeout
    });

    if (!response.ok) throw new Error('Failed to fetch HTML');

    let html = await response.text();
    
    // FIX 1: Unwrap <noscript> tags. Many sites (including Square/WordPress) hide the real logo inside a noscript tag for lazy-loading.
    html = html.replace(/<noscript([^>]*)>/gi, '<div$1>').replace(/<\/noscript>/gi, '</div>');

    const $ = cheerio.load(html);
    let logoUrl: string | null = null;

    // Helper: Safely extract the real image URL, prioritizing data-src and srcset to beat lazy loaders
    const getBestImageSrc = (imgEl: any): string | null => {
      let src = $(imgEl).attr('data-src') || $(imgEl).attr('src');

      // FIX 2: If src is missing or is just a base64 placeholder, try parsing the srcset (Heavily used by Square.site)
      if (!src || src.startsWith('data:image')) {
        const srcset = $(imgEl).attr('srcset') || $(imgEl).attr('data-srcset');
        if (srcset) {
           // Extracts the first URL from a srcset string
           src = srcset.split(',')[0].trim().split(' ')[0];
        }
      }

      if (src && src.startsWith('data:image')) return null; // Reject purely base64
      return src || null;
    };

    // Helper: Check if the URL is valid and not a social icon
    const isValidLogo = (url: string | null | undefined): boolean => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return !BANNED_KEYWORDS.some(kw => lower.includes(kw));
    };

    // --- STRATEGY 1: The "Home Link" Pattern (Catches Wix, Weebly, Square) ---
    $('a').each((_, a) => {
      const href = $(a).attr('href');
      if (!href) return;

      const cleanHref = href.split('?')[0].replace(/\/$/, '');
      const isHomeLink = cleanHref === '' ||
        cleanHref === '/' ||
        cleanHref === baseUrlNoSlash ||
        cleanHref === `http://${domain}` ||
        cleanHref === `https://${domain}` ||
        cleanHref === `http://www.${domain}` ||
        cleanHref === `https://www.${domain}`;

      if (isHomeLink) {
        const img = $(a).find('img').first();
        if (img.length > 0) {
          const src = getBestImageSrc(img[0]);
          if (isValidLogo(src)) {
            logoUrl = src;
            return false; // Break loop
          }
        }
      }
    });

    if (logoUrl) return resolveUrl(logoUrl, secureUrl);

    // --- STRATEGY 2: Manual Alt Text Check (Fixes Square sites where CSS selectors fail) ---
    $('img').each((_, img) => {
      const alt = $(img).attr('alt') || '';
      if (alt.toLowerCase().includes('logo')) {
        const src = getBestImageSrc(img);
        if (isValidLogo(src)) {
          logoUrl = src;
          return false;
        }
      }
    });

    if (logoUrl) return resolveUrl(logoUrl, secureUrl);

    // --- STRATEGY 3: Strict Attributes & Class Names (Catches WordPress, Custom HTML) ---
    const targetedSelectors = [
      'img[class*="logo" i]',        // Image class contains "logo"
      'img[id*="logo" i]',           // Image id contains "logo"
      '.site-logo img',              // Standard WP logo class
      '.navbar-brand img',           // Bootstrap brand image
      'header img',                  // Any image directly in the header
      '[class*="header"] img',       // Any image inside a container with "header" in the class
    ];

    for (const selector of targetedSelectors) {
      $(selector).each((_, img) => {
        const src = getBestImageSrc(img);
        if (isValidLogo(src)) {
          logoUrl = src;
          return false; // Break loop
        }
      });
      if (logoUrl) break;
    }

    if (logoUrl) return resolveUrl(logoUrl, secureUrl);

    // --- STRATEGY 4: URL Contains "logo" (Catches specific filenames like AH-Fancy-Logo.png) ---
    $('img').each((_, img) => {
      const src = getBestImageSrc(img);
      if (src && isValidLogo(src) && src.toLowerCase().includes('logo')) {
        logoUrl = src;
        return false; // Break loop
      }
    });

    if (logoUrl) return resolveUrl(logoUrl, secureUrl);

    // --- STRATEGY 5: Open Graph Metadata ---
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (isValidLogo(ogImage)) return resolveUrl(ogImage!, secureUrl);

    return null; // Fall back to Clearbit/Text later

  } catch (err) {
    return null;
  }
}

// Helper function to resolve relative URLs like "/wp-content/uploads/logo.png" to absolute URLs
function resolveUrl(rawUrl: string, baseUrl: string): string {
  if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
  if (rawUrl.startsWith('http')) return rawUrl;
  try {
    return new URL(rawUrl, baseUrl).href;
  } catch {
    return rawUrl;
  }
}

// ---------------------------------------------------------
// MAIN WORKER LOGIC
// ---------------------------------------------------------
export async function POST(req: Request) {
  try {
    // 1. Fetch pending batch
    const websites = await prisma.websiteData.findMany({
      where: { logoStatus: "pending" },
      orderBy: { row_number: 'asc' },
      take: 5
    });

    if (websites.length === 0) {
      return NextResponse.json({ message: "All done!" });
    }

    console.log(`Processing batch of ${websites.length}...`);

    for (const site of websites) {
      try {
        const urlObj = new URL(site.Website.startsWith('http') ? site.Website : `https://${site.Website}`);
        const domain = urlObj.hostname.replace('www.', '');
        const cleanDomainForId = domain.replace(/\./g, '_');

        const finalDownloadUrl = await extractLogoUrlFromWebsite(site.Website, domain);

        let imageResponse;

        if (finalDownloadUrl) {
          imageResponse = await fetch(finalDownloadUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000)
          });
        }

        // Fallbacks: Clearbit -> UI Avatars
        if (!imageResponse || !imageResponse.ok) {
          imageResponse = await fetch(`https://logo.clearbit.com/${domain}`, { signal: AbortSignal.timeout(5000) });
          if (!imageResponse.ok) {
            const textLogoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(domain)}&background=random&color=fff&size=512&format=png`;
            imageResponse = await fetch(textLogoUrl);
          }
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const finalBuffer = Buffer.from(arrayBuffer);

        const cloudinaryUrl = await uploadToCloudinary(finalBuffer, cleanDomainForId);

        await prisma.websiteData.update({
          where: { id: site.id },
          data: { logoUrl: cloudinaryUrl, logoStatus: "success", logoChecked: true }
        });

      } catch (error) {
        console.error(`Failed ${site.Website}`);
        await prisma.websiteData.update({
          where: { id: site.id },
          data: { logoStatus: "failed", logoChecked: true }
        });
      }
    }

    // 2. TRIGGER THE NEXT BATCH IN THE BACKGROUND
    // We do NOT await this fetch. We fire it and immediately return the response to whoever called this route.
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host');
    const selfUrl = `${protocol}://${host}/api/logo-worker`;

    fetch(selfUrl, { method: 'POST' }).catch(console.error);

    // Add a tiny delay to ensure the fetch fires before the Vercel function shuts down
    await new Promise(resolve => setTimeout(resolve, 200));

    return NextResponse.json({
      success: true,
      message: "Batch processed, triggering next batch in background."
    });

  } catch (error: any) {
    console.error("Worker Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}