// Every document the app knows about, and what is printed on each one.
//
// This one file drives everything: the picker, the form, the prompts, the JSON
// schema, and the synthetic samples. Add an entry here and the rest follows.
//
// Field labels and help text are shown to people filling in the form, so they
// are written in plain English — no jargon, no abbreviations left unexplained.

const text = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const date = (key, label, extra = {}) => ({ key, label, type: 'date', ...extra });
const area = (key, label, extra = {}) => ({ key, label, type: 'textarea', ...extra });
const choice = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });

const GENDER = ['Male', 'Female', 'Transgender'];

export const DOCUMENTS = [
  {
    id: 'aadhaar',
    name: 'Aadhaar card',
    issuer: 'Unique Identification Authority of India',
    blurb: 'The 12-digit number nearly everyone in India has. Shows who you are and where you live.',
    proves: ['Who you are', 'Where you live'],
    fields: [
      text('name', 'Full name', { required: true, placeholder: 'Exactly as printed on the card' }),
      date('date_of_birth', 'Date of birth'),
      choice('gender', 'Gender', GENDER),
      area('address', 'Address', { help: 'The address printed on the back of the card.' }),
      text('aadhaar_number', 'Aadhaar number', { required: true, placeholder: '1234 5678 9012', mono: true }),
      text('guardian_name', "Father's or guardian's name", { optional: true, help: 'Some cards print this after S/O, D/O or C/O. Leave blank if yours does not.' }),
    ],
    render: {
      template: 'id-card',
      title: 'GOVERNMENT OF INDIA',
      titleLocal: 'भारत सरकार',
      backTitle: 'UNIQUE IDENTIFICATION AUTHORITY OF INDIA',
      backTitleLocal: 'भारतीय विशिष्ट पहचान प्राधिकरण',
      tagline: 'मेरा आधार, मेरी पहचान',
      accent: '#ef7c22',
      accentBack: '#12864f',
      photo: true,
      front: ['name', 'date_of_birth', 'gender', 'guardian_name'],
      back: ['address'],
      numberField: 'aadhaar_number',
      numberLabel: 'Aadhaar Number',
    },
  },

  {
    id: 'pan',
    name: 'PAN card',
    issuer: 'Income Tax Department',
    blurb: 'The tax card. Needed to open a bank account, file returns, or make a large payment.',
    proves: ['Who you are', 'Your tax number'],
    fields: [
      text('name', 'Full name', { required: true, placeholder: 'As printed on the card' }),
      text('father_name', "Father's name", { help: 'PAN cards print the father\'s name, not the address.' }),
      date('date_of_birth', 'Date of birth'),
      text('pan_number', 'PAN', { required: true, placeholder: 'ABCDE1234F', mono: true, help: 'Five letters, four digits, then one more letter.' }),
    ],
    render: {
      template: 'id-card',
      title: 'INCOME TAX DEPARTMENT',
      titleLocal: 'आयकर विभाग',
      backTitle: 'GOVERNMENT OF INDIA',
      backTitleLocal: 'भारत सरकार',
      accent: '#1c62b9',
      accentBack: '#1c62b9',
      photo: true,
      front: ['name', 'father_name', 'date_of_birth'],
      back: [],
      numberField: 'pan_number',
      numberLabel: 'Permanent Account Number',
      singlePanel: true,
    },
  },

  {
    id: 'driving_licence',
    name: 'Driving licence',
    issuer: 'Regional Transport Office',
    blurb: 'Proof that someone may drive, and one of the commonest proofs of address.',
    proves: ['Who you are', 'Where you live', 'What they may drive'],
    fields: [
      text('name', 'Full name', { required: true }),
      text('guardian_name', "Father's or guardian's name", { optional: true }),
      date('date_of_birth', 'Date of birth'),
      area('address', 'Address'),
      text('licence_number', 'Licence number', { required: true, placeholder: 'MH12 20110012345', mono: true, help: 'Two letters for the state, then thirteen digits.' }),
      text('blood_group', 'Blood group', { optional: true, placeholder: 'B+' }),
      date('valid_till', 'Valid until', { optional: true }),
      text('vehicle_classes', 'Vehicle types allowed', { optional: true, placeholder: 'LMV, MCWG', help: 'LMV is a car, MCWG is a geared motorcycle.' }),
    ],
    render: {
      template: 'id-card',
      title: 'DRIVING LICENCE',
      titleLocal: 'चालक अनुज्ञप्ति',
      backTitle: 'TRANSPORT DEPARTMENT',
      backTitleLocal: 'परिवहन विभाग',
      accent: '#0d6a8f',
      accentBack: '#0d6a8f',
      photo: true,
      front: ['name', 'guardian_name', 'date_of_birth', 'blood_group', 'valid_till'],
      back: ['address', 'vehicle_classes'],
      numberField: 'licence_number',
      numberLabel: 'DL No.',
    },
  },

  {
    id: 'passport',
    name: 'Passport',
    issuer: 'Ministry of External Affairs',
    blurb: 'The strongest proof of identity and nationality. The details page is the one that matters.',
    proves: ['Who you are', 'Your nationality', 'Where you live'],
    fields: [
      text('surname', 'Surname', { required: true }),
      text('given_name', 'Given name', { required: true, help: 'Everything on the passport except the surname.' }),
      date('date_of_birth', 'Date of birth'),
      choice('gender', 'Gender', GENDER),
      text('place_of_birth', 'Place of birth', { placeholder: 'Town or city' }),
      text('passport_number', 'Passport number', { required: true, placeholder: 'M1234567', mono: true }),
      date('date_of_issue', 'Date of issue', { optional: true }),
      date('date_of_expiry', 'Valid until', { optional: true }),
    ],
    render: {
      template: 'passport-page',
      title: 'REPUBLIC OF INDIA',
      titleLocal: 'भारत गणराज्य',
      accent: '#1b4a8b',
      photo: true,
      numberField: 'passport_number',
    },
  },

  {
    id: 'voter_id',
    name: 'Voter ID',
    issuer: 'Election Commission of India',
    blurb: 'The card you vote with. Also called an EPIC. Carries a name, a relative\'s name and an address.',
    proves: ['Who you are', 'Where you live', 'That they can vote'],
    fields: [
      text('name', 'Full name', { required: true }),
      text('guardian_name', "Father's or husband's name", { help: 'Voter cards print a relative\'s name rather than an address on the front.' }),
      choice('gender', 'Gender', GENDER),
      date('date_of_birth', 'Date of birth', { optional: true }),
      area('address', 'Address'),
      text('epic_number', 'Voter ID number', { required: true, placeholder: 'ABC1234567', mono: true, help: 'Three letters then seven digits. Printed at the top of the card.' }),
    ],
    render: {
      template: 'id-card',
      title: 'ELECTION COMMISSION OF INDIA',
      titleLocal: 'भारत निर्वाचन आयोग',
      backTitle: 'ELECTOR PHOTO IDENTITY CARD',
      backTitleLocal: 'निर्वाचक फोटो पहचान पत्र',
      accent: '#6a2a86',
      accentBack: '#6a2a86',
      photo: true,
      front: ['name', 'guardian_name', 'gender', 'date_of_birth'],
      back: ['address'],
      numberField: 'epic_number',
      numberLabel: 'EPIC No.',
    },
  },

  {
    id: 'vehicle_rc',
    name: 'Vehicle registration certificate',
    issuer: 'Regional Transport Office',
    blurb: 'The RC. Says who owns a vehicle and exactly which vehicle it is.',
    proves: ['Who owns a vehicle', 'Which vehicle it is'],
    fields: [
      text('owner_name', "Owner's name", { required: true }),
      area('address', 'Address'),
      text('registration_number', 'Registration number', { required: true, placeholder: 'MH12AB1234', mono: true, help: 'The number on the number plate.' }),
      text('make_model', 'Make and model', { placeholder: 'Maruti Suzuki Swift VXi' }),
      text('chassis_number', 'Chassis number', { optional: true, mono: true }),
      text('engine_number', 'Engine number', { optional: true, mono: true }),
      text('fuel_type', 'Fuel', { optional: true, placeholder: 'Petrol' }),
      date('registration_date', 'Registered on', { optional: true }),
    ],
    render: {
      template: 'certificate',
      title: 'CERTIFICATE OF REGISTRATION',
      titleLocal: 'पंजीकरण प्रमाणपत्र',
      org: 'TRANSPORT DEPARTMENT, GOVERNMENT OF MAHARASHTRA',
      accent: '#12563f',
      numberField: 'registration_number',
      numberLabel: 'Registration No.',
    },
  },

  {
    id: 'ration_card',
    name: 'Ration card',
    issuer: 'State Food and Civil Supplies Department',
    blurb: 'Used to buy subsidised food. Lists the head of the household and everyone in it.',
    proves: ['Where you live', 'Who is in the household'],
    fields: [
      text('head_of_family', 'Head of the household', { required: true }),
      text('card_number', 'Ration card number', { required: true, mono: true }),
      choice('category', 'Card type', ['Antyodaya (AAY)', 'Priority household (PHH)', 'Above poverty line (APL)'], {
        help: 'Printed on the card. It sets how much subsidised grain the household gets.',
      }),
      area('address', 'Address'),
      text('member_count', 'Number of people on the card', { optional: true }),
      text('fps_name', 'Ration shop', { optional: true, help: 'The fair price shop the card is tied to.' }),
    ],
    render: {
      template: 'certificate',
      title: 'RATION CARD',
      titleLocal: 'राशन कार्ड',
      org: 'FOOD, CIVIL SUPPLIES AND CONSUMER PROTECTION DEPARTMENT',
      accent: '#9c4221',
      numberField: 'card_number',
      numberLabel: 'Card No.',
    },
  },

  {
    id: 'birth_certificate',
    name: 'Birth certificate',
    issuer: 'Registrar of Births and Deaths',
    blurb: 'The original record of a birth. Usually the only proof of date of birth a school will take.',
    proves: ['Date of birth', 'Place of birth', "Parents' names"],
    fields: [
      text('name', 'Name of the child', { required: true }),
      date('date_of_birth', 'Date of birth', { required: true }),
      text('place_of_birth', 'Place of birth', { placeholder: 'Hospital, town' }),
      choice('gender', 'Gender', GENDER),
      text('father_name', "Father's name"),
      text('mother_name', "Mother's name"),
      text('registration_number', 'Registration number', { required: true, mono: true }),
      date('date_of_registration', 'Registered on', { optional: true }),
    ],
    render: {
      template: 'certificate',
      title: 'CERTIFICATE OF BIRTH',
      titleLocal: 'जन्म प्रमाणपत्र',
      org: 'OFFICE OF THE REGISTRAR OF BIRTHS AND DEATHS',
      accent: '#2c4a7c',
      numberField: 'registration_number',
      numberLabel: 'Registration No.',
      seal: true,
    },
  },

  {
    id: 'gst_certificate',
    name: 'GST registration certificate',
    issuer: 'Goods and Services Tax Network',
    blurb: 'Proof that a business is registered for GST. The 15-character number contains the owner\'s PAN.',
    proves: ['That a business is registered', 'Where it trades from'],
    fields: [
      text('legal_name', 'Legal name of the business', { required: true }),
      text('trade_name', 'Trading name', { optional: true, help: 'The name customers see, if it differs from the legal name.' }),
      text('gstin', 'GST number', { required: true, placeholder: '27ABCDE1234F1Z5', mono: true, help: 'Fifteen characters. The middle ten are the owner\'s PAN.' }),
      area('address', 'Business address'),
      choice('constitution', 'Kind of business', ['Proprietorship', 'Partnership', 'Private Limited Company', 'Public Limited Company', 'LLP', 'Trust', 'Society']),
      date('registration_date', 'Registered on', { optional: true }),
    ],
    render: {
      template: 'certificate',
      title: 'REGISTRATION CERTIFICATE',
      titleLocal: 'पंजीकरण प्रमाणपत्र',
      org: 'GOODS AND SERVICES TAX — FORM GST REG-06',
      accent: '#1c5d8c',
      numberField: 'gstin',
      numberLabel: 'GSTIN',
      seal: true,
    },
  },

  {
    id: 'udyam',
    name: 'Udyam (MSME) certificate',
    issuer: 'Ministry of Micro, Small and Medium Enterprises',
    blurb: 'Registers a small business so it can claim government schemes and cheaper loans.',
    proves: ['That a small business is registered', 'Its size band'],
    fields: [
      text('enterprise_name', 'Name of the enterprise', { required: true }),
      text('udyam_number', 'Udyam number', { required: true, placeholder: 'UDYAM-MH-33-0012345', mono: true }),
      text('owner_name', "Owner's name"),
      choice('enterprise_type', 'Size', ['Micro', 'Small', 'Medium'], { help: 'Set by how much the business has invested and turns over.' }),
      area('address', 'Business address'),
      date('commencement_date', 'Business started on', { optional: true }),
    ],
    render: {
      template: 'certificate',
      title: 'UDYAM REGISTRATION CERTIFICATE',
      titleLocal: 'उद्यम पंजीकरण प्रमाणपत्र',
      org: 'MINISTRY OF MICRO, SMALL AND MEDIUM ENTERPRISES',
      accent: '#6b3fa0',
      numberField: 'udyam_number',
      numberLabel: 'Udyam Registration Number',
      seal: true,
    },
  },

  {
    id: 'nrega_job_card',
    name: 'MGNREGA job card',
    issuer: 'Ministry of Rural Development',
    blurb: 'Entitles a rural household to a hundred days of paid work a year. Accepted as ID by banks.',
    proves: ['Who you are', 'Which village you belong to'],
    fields: [
      text('name', 'Name of the applicant', { required: true }),
      text('job_card_number', 'Job card number', { required: true, placeholder: 'RJ-02-004-011-001/123', mono: true }),
      text('guardian_name', "Father's or husband's name"),
      text('village', 'Village'),
      text('panchayat', 'Gram panchayat', { optional: true }),
      text('district', 'District'),
      text('state', 'State'),
      choice('category', 'Category', ['General', 'OBC', 'SC', 'ST'], { optional: true }),
    ],
    render: {
      template: 'certificate',
      title: 'MGNREGA JOB CARD',
      titleLocal: 'मनरेगा जॉब कार्ड',
      org: 'MAHATMA GANDHI NATIONAL RURAL EMPLOYMENT GUARANTEE ACT',
      accent: '#1d6b45',
      numberField: 'job_card_number',
      numberLabel: 'Job Card No.',
    },
  },

  {
    id: 'abha',
    name: 'ABHA health card',
    issuer: 'National Health Authority',
    blurb: 'A 14-digit health account number that links someone\'s medical records across hospitals.',
    proves: ['Who you are', 'Your health account number'],
    fields: [
      text('name', 'Full name', { required: true }),
      text('abha_number', 'ABHA number', { required: true, placeholder: '12-3456-7890-1234', mono: true }),
      date('date_of_birth', 'Date of birth'),
      choice('gender', 'Gender', GENDER),
      text('abha_address', 'ABHA address', { optional: true, placeholder: 'name@abdm', help: 'The username-style handle printed under the number.' }),
      area('address', 'Address', { optional: true }),
    ],
    render: {
      template: 'id-card',
      title: 'AYUSHMAN BHARAT HEALTH ACCOUNT',
      titleLocal: 'आयुष्मान भारत हेल्थ अकाउंट',
      backTitle: 'NATIONAL HEALTH AUTHORITY',
      backTitleLocal: 'राष्ट्रीय स्वास्थ्य प्राधिकरण',
      accent: '#0e7c86',
      accentBack: '#0e7c86',
      photo: true,
      front: ['name', 'date_of_birth', 'gender', 'abha_address'],
      back: ['address'],
      numberField: 'abha_number',
      numberLabel: 'ABHA Number',
    },
  },
];

DOCUMENTS.push(
  {
    id: 'din_letter',
    name: 'Director ID letter',
    issuer: 'Ministry of Corporate Affairs',
    blurb: 'Allots a person the 8-digit number they need to be a company director. One number per person, for life.',
    proves: ['Who you are', 'That they may be a director'],
    entity: 'person',
    fields: [
      text('name', 'Full name', { required: true }),
      text('din', 'Director ID number', { required: true, placeholder: '00123456', mono: true, help: 'Eight digits. A person only ever gets one.' }),
      text('father_name', "Father's name"),
      date('date_of_birth', 'Date of birth'),
      area('address', 'Address'),
      date('date_of_allotment', 'Allotted on', { optional: true }),
    ],
    render: {
      template: 'certificate',
      title: 'DIRECTOR IDENTIFICATION NUMBER',
      titleLocal: 'निदेशक पहचान संख्या',
      org: 'MINISTRY OF CORPORATE AFFAIRS — DIN CELL',
      accent: '#2f4858',
      numberField: 'din',
      numberLabel: 'DIN',
      seal: true,
    },
  },

  {
    id: 'incorporation',
    name: 'Certificate of incorporation',
    issuer: 'Registrar of Companies',
    blurb: 'The birth certificate of a company. Carries the 21-character company number and the registered office.',
    proves: ['That a company exists', 'Where it is registered'],
    entity: 'company',
    fields: [
      text('company_name', 'Company name', { required: true }),
      text('cin', 'Company number', { required: true, placeholder: 'U72200KA2013PTC098765', mono: true, help: 'Twenty-one characters. It encodes the state, the year and the kind of company.' }),
      date('date_of_incorporation', 'Incorporated on'),
      area('registered_office', 'Registered office'),
      text('company_pan', "Company's PAN", { optional: true, mono: true, help: 'A company has its own PAN, separate from its directors.' }),
      text('directors', 'Directors', { optional: true, help: 'Names as listed on the certificate, separated by commas.' }),
    ],
    render: {
      template: 'certificate',
      title: 'CERTIFICATE OF INCORPORATION',
      titleLocal: 'निगमन प्रमाणपत्र',
      org: 'REGISTRAR OF COMPANIES — MINISTRY OF CORPORATE AFFAIRS',
      accent: '#7a3b2e',
      numberField: 'cin',
      numberLabel: 'Corporate Identity Number',
      seal: true,
    },
  },

  {
    id: 'bank_passbook',
    name: 'Bank passbook',
    issuer: 'The account holder’s bank',
    blurb: 'The front page of a passbook. Widely used to prove a name, an address and a bank account together.',
    proves: ['Who you are', 'Where you live', 'Your bank account'],
    entity: 'either',
    fields: [
      text('account_holder', 'Account holder', { required: true }),
      text('account_number', 'Account number', { required: true, mono: true }),
      text('ifsc', 'Branch code (IFSC)', { required: true, placeholder: 'HDFC0001234', mono: true, help: 'Printed near the branch name. Four letters, a zero, then six characters.' }),
      text('bank_name', 'Bank'),
      text('branch', 'Branch'),
      area('address', 'Address'),
      text('customer_id', 'Customer ID', { optional: true, mono: true }),
    ],
    render: {
      template: 'certificate',
      title: 'SAVINGS BANK ACCOUNT PASSBOOK',
      titleLocal: 'बचत खाता पासबुक',
      org: 'BHARAT NATIONAL BANK — A GOVERNMENT OF INDIA UNDERTAKING',
      accent: '#134a6e',
      numberField: 'account_number',
      numberLabel: 'Account No.',
    },
  },
);

// Whether a document is about a person, an organisation, or can be either.
// Used when grouping a pile of documents by who they belong to.
const ENTITY_KIND = {
  aadhaar: 'person',
  pan: 'person',
  driving_licence: 'person',
  passport: 'person',
  voter_id: 'person',
  vehicle_rc: 'either',
  ration_card: 'person',
  birth_certificate: 'person',
  gst_certificate: 'company',
  udyam: 'company',
  nrega_job_card: 'person',
  abha: 'person',
};

for (const doc of DOCUMENTS) doc.entity ??= ENTITY_KIND[doc.id] ?? 'person';

export const DOCUMENT_IDS = DOCUMENTS.map((d) => d.id);

export function getDocument(id) {
  return DOCUMENTS.find((d) => d.id === id) ?? null;
}

/** The identity-defining fields — a disagreement in any of these is serious. */
const CRITICAL_FIELDS = new Set([
  'name',
  'surname',
  'given_name',
  'owner_name',
  'head_of_family',
  'legal_name',
  'enterprise_name',
  'date_of_birth',
  // On a birth certificate or a passport, where someone was born is not a
  // detail — it is one of the facts the document exists to record.
  'place_of_birth',
  'aadhaar_number',
  'pan_number',
  'licence_number',
  'passport_number',
  'epic_number',
  'registration_number',
  'gstin',
  'udyam_number',
  'abha_number',
  'job_card_number',
  'card_number',
  'din',
  'cin',
  'company_name',
  'account_holder',
  'account_number',
]);

export const isCriticalField = (key) => CRITICAL_FIELDS.has(key);

/** What the picker shows: enough to choose, not enough to read as a spec sheet. */
export function documentSummaries() {
  return DOCUMENTS.map(({ id, name, issuer, blurb, proves }) => ({ id, name, issuer, blurb, proves }));
}
