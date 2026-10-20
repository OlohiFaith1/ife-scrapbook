import generated from './data/pages.generated.json';

export interface Page {
  /** 0 = cover, 1–20 = numbered pages. */
  index: number;
  slug: string;
  label: string;
  title: string;
  alt: string;
  width: number;
  height: number;
  /** Average colour of the artwork, shown while the image loads. */
  color: string;
}

export const WIDTHS: number[] = generated.widths;

const COPY: Record<string, { title: string; alt: string }> = {
  cover: {
    title: 'The Lapo Files',
    alt: "Cover of The Lapo Files, Issue 001: the title in large white letters on royal blue, with a sticky note reading “he insisted on a cover design. i have no hand in this. — lapo”.",
  },
  '01': {
    title: 'Before you continue',
    alt: 'Introduction letter in blue capitals on cream: millions of pens disappear every day, and nobody asks questions — until now. It closes with a plea to return the pen you borrowed, signed Ifeoluwa.',
  },
  '02': {
    title: 'You have no idea where I’ve been',
    alt: 'A cloud of deep blue ink blooming in water, with the handwritten line “You have no idea where I’ve been.”',
  },
  '03': {
    title: 'It’s a pen’s world',
    alt: 'Blue page with the headline “It’s a pen’s world” in huge vertical white type, subtitled “We are just living in it”, over two columns of text.',
  },
  '04': {
    title: 'The Fridge Incident',
    alt: 'Photo of a cream retro refrigerator against a brick wall beside the article “The Fridge Incident”, with the pull quote “Every day, another location. Nobody is asking questions.”',
  },
  '05': {
    title: 'Meet Lapo Pen',
    alt: 'Interview page titled “Meet Lapo Pen”: questions in bold sans-serif answered in blue handwriting.',
  },
  '06': {
    title: 'The interview, continued',
    alt: 'Interview continued beneath splashes of blue ink: “After everything, what would you like people to know about you?”, followed by “One last thing.”',
  },
  '07': {
    title: 'Things Pens Remember — part one',
    alt: 'Short memories titled The Examination Hall and The Borrower, set in small blue type with ink spots in the corner.',
  },
  '08': {
    title: 'Things Pens Remember',
    alt: 'Short memories titled The Pen Game, The Letter and The Return, with the large script heading “Things Pens Remember”.',
  },
  '09': {
    title: 'The plaintiff',
    alt: 'Royal blue page with a giant white letter T opening the complaint: “The plaintiff, Lapo Pen, brings a complaint against the owner for repeated mishandling…”',
  },
  '10': {
    title: 'The case, continued',
    alt: 'Two columns of case notes on cream detailing drops, defences and claims, ending “47 drops. Zero apologies.”',
  },
  '11': {
    title: 'The questioning',
    alt: 'Blue page of chat bubbles: black interview questions such as “Do you remember the first time you were dropped?” answered in white handwritten notes.',
  },
  '12': {
    title: 'Blue marble',
    alt: 'Full-page abstract of swirling, marbled blue ink.',
  },
  '13': {
    title: 'Born into the right hands',
    alt: 'Deep blue page headlined “Born into the right hands”: an article about Nepo Pen, with a boxed list of Nepo’s personal rules.',
  },
  '14': {
    title: 'The private journal of Nepo Pen',
    alt: 'Diary page “From the private journal of Nepo Pen”, with an entry for each day from Monday to Sunday.',
  },
  '15': {
    title: 'Ink in water',
    alt: 'Bright blue ink drifting and folding through clear water.',
  },
  '16': {
    title: 'You look… well-travelled',
    alt: 'A full page of conversation in alternating blue sans-serif and handwriting, beginning “You look… well-travelled.”',
  },
  '17': {
    title: 'Every pen has a story',
    alt: 'Blue page headlined “Every pen has a story” in white, above a long block of text.',
  },
  '18': {
    title: 'Justice for pens!',
    alt: 'Cream page with the slogan “Justice for pens!” in bold blue letters.',
  },
  '19': {
    title: 'The Final Statement',
    alt: 'A sweeping navy brushstroke beside the closing text, titled “The Final Statement” in blue script.',
  },
  '20': {
    title: 'Back cover',
    alt: 'Back cover: a plain field of deep royal blue.',
  },
};

export const PAGES: Page[] = generated.pages.map((p, index) => ({
  index,
  slug: p.slug,
  label: index === 0 ? 'Cover' : `Page ${index}`,
  width: p.width,
  height: p.height,
  color: p.color,
  ...COPY[p.slug],
}));

export function src(page: Page, width: number): string {
  return `${import.meta.env.BASE_URL}pages/${page.slug}-${width}.webp`;
}

export function srcset(page: Page, widths: number[] = WIDTHS): string {
  return widths.map((w) => `${src(page, w)} ${w}w`).join(', ');
}
