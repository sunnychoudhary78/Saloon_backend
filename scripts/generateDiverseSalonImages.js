'use strict';

require('dotenv').config({ path: './.env' });
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { Salon } = require('./models');

const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const SALONS_DIR = path.join(__dirname, 'uploads', 'salons');

if (!accountId || !apiToken) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

const SEED_PROMPTS = {
  1: 'Interior of a modern luxury women beauty salon named Glow & Grace, elegant rose gold trim, illuminated vanity mirrors, plush beige styling chairs, marble flooring, high-end salon aesthetic, architectural photography, 4k',
  2: 'Luxury hair washing and shampoo lounge in a salon, ergonomic black reclining wash basins with chrome faucets, soft warm recessed ceiling lighting, neat shelves of hair care products',
  3: 'Boutique salon manicure and pedicure nail station, velvet pink armchairs, marble manicure table with neatly organized colorful nail polishes, modern aesthetic',

  4: 'Interior of a trendy modern barbershop named Elite Cuts, exposed brick wall, vintage black leather barber chairs, warm industrial lighting, wood counters, barber mirrors, 4k',
  5: 'Barbershop workstation detail, professional Japanese steel shears, electric hair clippers on magnetic mat, aftershave bottles, clean barber station, warm lighting',

  6: 'Trendy urban unisex hair salon named Urban Style Salon, industrial loft design, dark grey walls, neon styling sign, sleek hydraulic salon chairs, full length mirrors, modern city salon, 4k',
  7: 'Hair color mixing lab and bar in a modern salon, glass bottles of hair dye and developer, stainless steel bowls, neatly organized color swatch book',
  8: 'Salon hair styling station with round ring light mirror, black leather chair, professional ceramic hair dryer and styling irons, clean concrete floor',
  9: 'Modern hair salon waiting area and reception, leather sofa, espresso coffee machine bar, magazines on walnut coffee table, stylish pendant lights',

  10: 'Luxury wellness spa and salon interior named Serenity Spa, serene atmosphere, warm candlelight, bamboo plants, natural river stone accents, teak wood elements, peaceful relaxation vibe, 4k',
  11: 'Private ayurvedic massage and spa therapy room, wooden massage table with rolled white towels, orchid flowers, essential oil ceramic diffuser with gentle mist',
  12: 'Spa hydrotherapy foot soak and relaxation basin, copper foot bath bowl filled with floating rose petals, smooth warm basalt stones, ambient mood lighting',

  13: 'Classic vintage gentlemen barber lounge named The Barber Lounge, rich dark mahogany wood paneling, antique red leather barber chairs, brass trim, warm amber lighting, luxury club vibe, 4k',
  14: 'Traditional straight razor hot towel shave station, badger hair shaving brush in lather mug, hot steam towel warmer cabinet, vintage glass tonic bottles',
  15: 'Barber lounge waiting area with Chesterfield button-tufted brown leather sofa, vintage barbershop decor, brass coat rack, premium gentlemen atmosphere',

  16: 'Chic contemporary women hair salon named Bliss Salon, soft pastel blush and ivory tones, arched mirrors with glowing LED backlights, white marble reception desk, bright airy photography, 4k',
  17: 'Hair blowout and styling station, premium hair styling tools on brushed gold trays, ceramic round brushes, large round illuminated mirror',
  18: 'Luxury facial and aesthetic skin clinic room in a salon, adjustable electric treatment bed, skincare serum bottles, soft clean white linen',

  19: 'Royal Indian bridal makeover and beauty studio named Bridal Studio by Meera, ornate golden vanity mirror with Hollywood vanity bulb lights, royal maroon velvet curtains, bridal jewelry showcase, 4k',
  20: 'Bridal hairstyling accessories and fresh jasmine gajra flowers on vanity table, traditional Indian gold hair ornaments, curling irons',
  21: 'Professional bridal makeup artist vanity station, organized luxury eyeshadow palettes, blush kits, makeup brushes in golden glass holders',

  22: 'Executive luxury men salon interior named Royal Grooming, royal navy blue accent walls with gold geometric trim, premium black leather barber chairs, marble floor, 4k',
  23: 'Men facial and beard grooming station, facial steamer with ozone mist, beard oils, warm face towels, luxury grooming suite',
  24: 'VIP private grooming lounge room, plush leather armchair, personal screen, warm acoustic wooden slats wall, private salon sanctuary',
  25: 'Hair spa and scalp treatment wash station, reclining massage shampoo bed, Japanese head spa waterfall arch basin',

  26: 'Bright minimalist Scandinavian hair salon named Fresh Look Salon, natural light pouring through large glass windows, light birch wood furniture, lush green indoor plants, clean airy aesthetic, 4k',
  27: 'Eco-friendly salon retail display shelves, organic vegan hair care bottles, bamboo hairbrushes, minimalist product showcase',

  28: 'Japanese zen wellness salon interior named Zen Spa, natural cedar wood, shoji screen panels, bonsai tree on wooden shelf, tranquil ambient lighting, minimalist serenity, 4k',
  29: 'Shirodhara ayurvedic oil treatment setup in a spa, traditional carved wooden table with hanging bronze oil pot, warm herbal aroma',
  30: 'Post-treatment herbal tea relaxation lounge, low wooden table with Japanese green tea set, linen floor cushions, tranquil indoor water fountain',

  31: 'Modern high-end hair salon exterior storefront with glowing warm logo signage at dusk, large clear window showing chic interior',
  32: 'Hair coloring specialist workstation with balayage foil boards and professional tint brushes',
  33: 'Trendy men fade haircut in progress at a modern salon, mirror reflection showing barber detailing hairline',
  34: 'Deluxe salon hair treatment steam bowl with warm micro-mist for deep hair conditioning',
  35: 'Glamorous salon hair wash basin area with dim relaxing starry ceiling lights',
};

async function generateSingleImage(prompt) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await axios.post(
    url,
    { prompt },
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const b64 = res.data?.result?.image;
  if (!b64) throw new Error('No image returned from Cloudflare Flux');
  const rawBuf = Buffer.from(b64, 'base64');
  return await sharp(rawBuf)
    .resize(960, 600, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

async function main() {
  fs.mkdirSync(SALONS_DIR, { recursive: true });
  console.log('Generating diverse, photorealistic salon images...');

  const ids = Object.keys(SEED_PROMPTS).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    const prompt = SEED_PROMPTS[id];
    const outFilename = `seed-${id}.jpg`;
    const outPath = path.join(SALONS_DIR, outFilename);
    const t0 = Date.now();

    try {
      console.log(`[${id}/35] Generating ${outFilename}...`);
      const imgBuffer = await generateSingleImage(prompt);
      await fs.promises.writeFile(outPath, imgBuffer);
      console.log(`  ✓ Saved ${outFilename} (${imgBuffer.length} bytes) in ${Date.now() - t0}ms`);
      // Gentle pause to avoid rate limiting
      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      console.error(`  ✗ Failed seed-${id}.jpg:`, err.response?.data || err.message);
    }
  }

  console.log('\nAll images generated! Now updating salon database URLs with cache buster query (?v=2)...');
  const salons = await Salon.findAll();
  for (const s of salons) {
    let updated = false;
    let cover = s.cover_image;
    if (cover && cover.includes('/seed-') && !cover.includes('?v=')) {
      cover = `${cover}?v=2`;
      s.cover_image = cover;
      updated = true;
    }

    let gallery = s.gallery_images;
    if (Array.isArray(gallery)) {
      const newGallery = gallery.map((g) => {
        if (typeof g === 'string' && g.includes('/seed-') && !g.includes('?v=')) {
          return `${g}?v=2`;
        }
        return g;
      });
      s.gallery_images = newGallery;
      updated = true;
    }

    if (updated) {
      await s.save();
      console.log(`Updated salon: ${s.salon_name} -> ${s.cover_image}`);
    }
  }

  console.log('Done! All salon images are now unique and diverse.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
