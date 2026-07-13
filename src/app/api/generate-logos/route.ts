import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  row_number: number;
  Website: string;
  logoUrl?: string;
  logoShape?: string;
  logoStatus?: string;
  logoChecked?: boolean;
  logoError?: string;
};

const DATA_FILE = path.join(process.cwd(), "data", "test.json");
const LOGO_DIR = path.join(process.cwd(), "public", "logos");

function sanitizeFileName(value: string) {
  return value.replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
}

async function readRows(): Promise<Row[]> {
  const filePath = path.join(process.cwd(), "data", "test.json");
  const raw = await fs.readFile(filePath, "utf8");

  console.log("RAW LENGTH:", raw.length);
  console.log("RAW START:", JSON.stringify(raw.slice(0, 200)));

  const clean = raw.replace(/^\uFEFF/, "").trim();

  console.log("CLEAN START:", JSON.stringify(clean.slice(0, 200)));

  if (!clean) {
    throw new Error("data/test.json is empty");
  }

  const parsed = JSON.parse(clean);

  console.log("IS ARRAY:", Array.isArray(parsed));
  console.log("PARSED PREVIEW:", Array.isArray(parsed) ? parsed.slice(0, 2) : parsed);

  if (!Array.isArray(parsed)) {
    throw new Error("data/test.json must be an array");
  }

  return parsed.map((row: any) => ({
    row_number: row.row_number,
    Website: row.Website,
    logoUrl: row.logoUrl ?? "",
    logoShape: row.logoShape ?? "unknown",
    logoStatus: row.logoStatus ?? "pending",
    logoChecked: row.logoChecked ?? false,
    logoError: row.logoError ?? "",
  }));
}

async function saveRows(rows: Row[]) {
  await fs.writeFile(DATA_FILE, JSON.stringify(rows, null, 2), "utf8");
}

async function ensureLogoDir() {
  await fs.mkdir(LOGO_DIR, { recursive: true });
}

async function findLogoUrl(page: any, website: string) {
  await page.goto(website, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  await page.waitForTimeout(2500);

  const candidates = await page.evaluate(() => {
    const out: string[] = [];

    const push = (value?: string | null) => {
      if (value && typeof value === "string" && value.trim()) {
        out.push(value.trim());
      }
    };

    document.querySelectorAll("img").forEach((img) => {
      const el = img as HTMLImageElement;
      const text = `${el.src} ${el.alt} ${el.className} ${el.id}`.toLowerCase();

      if (
        text.includes("logo") ||
        text.includes("brand") ||
        text.includes("header") ||
        text.includes("navbar")
      ) {
        push(el.src);
      }
    });

    document
      .querySelectorAll("header img, nav img, [class*=logo] img, [id*=logo] img")
      .forEach((img) => {
        const el = img as HTMLImageElement;
        push(el.src);
      });

    const ogImage = document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content");
    push(ogImage);

    document
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
      .forEach((link) => {
        push(link.getAttribute("href"));
      });

    return [...new Set(out)];
  });

  for (const item of candidates) {
    try {
      return new URL(item, website).toString();
    } catch {}
  }

  try {
    return new URL("/favicon.ico", website).toString();
  } catch {
    return null;
  }
}

async function downloadBuffer(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      accept: "image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const arrayBuffer = await response.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

async function removeBgIfNeeded(input: Buffer, contentType: string) {
  if (contentType.includes("svg")) {
    return { buffer: input, ext: "svg" };
  }

  if (
    contentType.includes("x-icon") ||
    contentType.includes("icon") ||
    contentType.includes("ico")
  ) {
    const png = await sharp(input).png().toBuffer();
    return { buffer: png, ext: "png" };
  }

  try {
    const blob = await removeBackground(input);
    const bgRemoved = Buffer.from(await blob.arrayBuffer());
    const png = await sharp(bgRemoved).png().toBuffer();
    return { buffer: png, ext: "png" };
  } catch {
    const png = await sharp(input).png().toBuffer();
    return { buffer: png, ext: "png" };
  }
}

async function saveLogo(website: string, buffer: Buffer, ext: string) {
  const host = new URL(website).hostname.replace(/^www\./, "");
  const fileName = `${sanitizeFileName(host)}.${ext}`;
  const fullPath = path.join(LOGO_DIR, fileName);

  await fs.writeFile(fullPath, buffer);
  return `/logos/${fileName}`;
}

export async function POST() {
  try {
    console.log("START generate logos");
    console.log("DATA_FILE:", DATA_FILE);
    console.log("LOGO_DIR:", LOGO_DIR);

    const rows = await readRows();
    console.log("ROWS COUNT:", rows.length);

    await ensureLogoDir();

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });

    const results: Array<{
      website: string;
      status: "success" | "failed";
      logoUrl?: string;
      error?: string;
    }> = [];

    for (const row of rows) {
      console.log("PROCESSING:", row.Website);

      try {
        const logoUrl = await findLogoUrl(page, row.Website);
        console.log("FOUND LOGO URL:", logoUrl);

        if (!logoUrl) {
          throw new Error("No logo found");
        }

        const { buffer, contentType } = await downloadBuffer(logoUrl);
        console.log("DOWNLOADED:", contentType, buffer.length);

        const processed = await removeBgIfNeeded(buffer, contentType);
        console.log("PROCESSED:", processed.ext, processed.buffer.length);

        const localUrl = await saveLogo(row.Website, processed.buffer, processed.ext);
        console.log("SAVED:", localUrl);

        row.logoUrl = localUrl;
        row.logoStatus = "success";
        row.logoChecked = true;
        row.logoShape = "unknown";
        row.logoError = "";

        results.push({
          website: row.Website,
          status: "success",
          logoUrl: localUrl,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("ROW FAILED:", row.Website, message);

        row.logoStatus = "failed";
        row.logoChecked = true;
        row.logoError = message;

        results.push({
          website: row.Website,
          status: "failed",
          error: message,
        });
      }
    }

    await browser.close();
    await saveRows(rows);

    const successCount = results.filter((item) => item.status === "success").length;
    const failedCount = results.filter((item) => item.status === "failed").length;

    return NextResponse.json({
      success: true,
      total: rows.length,
      successCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error("TOP LEVEL ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}