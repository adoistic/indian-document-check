// The demo film, scene by scene.
//
// Each scene is either a slide (drawn in slides.js) or a piece of the app being
// used (recorded in capture.js). The narration is what sets the timing: every
// scene lasts exactly as long as its own line takes to say, so the picture and
// the voice can never drift apart.
//
// The narration deliberately avoids how any of it is built. It is about what
// the thing does and who it helps.

export const VOICE = {
  voice_name: 'Leda',
  accent: 'Neutral',
  style: 'Vocal Smile',
  pace: 'Natural',
};

/** Steering for the read: one speaker, one manner, across every line. */
export const VOICE_CONTEXT =
  'The narrator is an Indian woman speaking Indian English with a natural, unforced Indian accent — the English of an educated woman from Mumbai or Bangalore. Warm, clear and unhurried, the way a good colleague explains something she is genuinely pleased with. Not a hard sell, not a newsreader. She is narrating a short film about a piece of software.';

export const SCENES = [
  {
    id: '01-open',
    kind: 'slide',
    slide: 'title',
    say: 'Every day, in banks, in rental offices, in hospitals, somebody in India is asked for their documents. And somebody else has to check them.',
  },
  {
    id: '02-problem',
    kind: 'slide',
    slide: 'problem',
    say: 'That check is usually a person, squinting at a card, typing a twelve digit number in by hand, hoping they have got it right. It is slow. And it is exactly the sort of work where mistakes quietly creep in.',
  },
  {
    id: '03-pick',
    kind: 'clip',
    capture: 'pick',
    say: 'This is Document Check. You tell it what you are holding. An Aadhaar card, a PAN card, a driving licence, a passport, a ration card, a company certificate. Fifteen kinds of Indian paperwork in all.',
  },
  {
    id: '04-fill',
    kind: 'clip',
    capture: 'fill',
    say: 'Then you give it a photo. And here is the first nice moment. You do not type anything at all. It reads the card, and fills the form in for you. Every field, straight off the document.',
  },
  {
    id: '05-check',
    kind: 'clip',
    capture: 'check',
    say: 'Now the real question. Do the details you were given actually match the document in front of you? You get a plain answer, line by line. What was typed, what the card says, and whether that difference matters.',
  },
  {
    id: '06-judgement',
    kind: 'slide',
    slide: 'judgement',
    say: 'Because not every difference is a problem. Priya V. and Priya Venkatesan are the same woman. Sandeep and Sandip are the same man. A short address is still the same house. A different date of birth is another matter entirely, and it will say so.',
  },
  {
    id: '07-wrong',
    kind: 'clip',
    capture: 'wrong',
    say: 'And when somebody hands over the wrong thing altogether, it tells you that instead. Wrong document and wrong details are two different problems, and the person at the counter needs to know which one they are looking at.',
  },
  {
    id: '08-pile-intro',
    kind: 'slide',
    slide: 'pile',
    say: 'But real life is rarely one tidy document at a time.',
  },
  {
    id: '09-drop',
    kind: 'clip',
    capture: 'drop',
    say: 'So you can also simply empty the whole folder into it. Thirteen files here. Nothing labelled, nothing sorted, several different people muddled together. Watch what happens.',
  },
  {
    id: '10-entities',
    kind: 'clip',
    capture: 'entities',
    say: 'It works out what every single one of them is. And then, far more usefully, it works out who they belong to. Here is one man and his six documents. Here are two people who have nothing to do with him. And here is his shop, and a company.',
  },
  {
    id: '11-links',
    kind: 'clip',
    capture: 'links',
    say: 'It finds the connections too. It has noticed that his shop is registered under his own tax number, and that his name is printed as a director on the company certificate. Nobody told it any of that. It worked it out from the papers themselves.',
  },
  {
    id: '12-twins',
    kind: 'slide',
    slide: 'twins',
    say: 'And this is my favourite part. There are two men called Sandeep Joshi in that pile. The same name, letter for letter. It kept them apart, because everything else about them is different.',
  },
  {
    id: '13-uses',
    kind: 'slide',
    slide: 'uses',
    say: 'Think about where that goes. Opening a bank account. Renting a flat. Taking on a new employee. A loan file. Signing a family up for a government scheme. Admitting a patient. Anywhere a stack of paper has to turn into a decision.',
  },
  {
    id: '14-close',
    kind: 'slide',
    slide: 'close',
    say: 'Less typing. Far fewer mistakes. And a second pair of eyes that never gets tired at four in the afternoon.',
  },
];

/** Silence after each line, so the film breathes. */
export const GAP_SECONDS = 0.45;

/** A little longer where a slide changes the subject. */
export const LONG_GAP_AFTER = new Set(['02-problem', '08-pile-intro', '12-twins']);
