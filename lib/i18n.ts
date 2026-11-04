import type { CheckupQuestion, Locale } from '@/types';

/** Yoca — locale dictionaries (en / tr / az). Server-side; pass strings to client components as props. */

export interface Dict {
  meta: {
    homeTitle: string;
    homeDescription: string;
    checkupTitle: string;
    checkupDescription: string;
  };
  nav: { home: string; about: string; services: string; work: string; products: string; checkup: string; contact: string; insights: string };
  overview: {
    metaTitle: string;
    metaDescription: string;
    title: string;
    identity: string;
    cover: string;
    /** Two explicit hero lines — rendered as separate blocks, never concatenated. */
    coverLines: [string, string];
    menuLabel: string;
    /** Screen-reader progress label — "{n}" and "{total}" are replaced. */
    sceneOf: string;
    /** One localized data structure for the three systems (unique descriptor + steps + short bar word). */
    systems: Array<{ short: string; descriptor: string; steps: string[] }>;
    whoHeading: string;
    cue: string;
    menu: string[];
    backToSite: string;
    scene: string;
    whatHeading: string;
    whatSub: string;
    whatWords: string[];
    whyLines: string[];
    whyConclusion: string;
    systemsCaption: string;
    servicesCta: string;
    processHeading: string;
    processLines: string[];
    workLabel: string;
    workCta: string;
    productsOpen: string;
    productsReveal: string;
    productsCta: string;
    whoLines: string[];
    whoTraits: string[];
    whoFormula: string;
    globalLine: string;
    finalSmall: string;
    finalLarge: string;
    pathProject: string;
    pathCheckup: string;
    pathCheckupSub: string;
    pathSite: string;
  };
  insights: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    heading: string;
    sub: string;
    featured: string;
    latest: string;
    all: string;
    minRead: string;
    by: string;
    related: string;
    sources: string;
    faq: string;
    ctaLine: string;
    exploreService: string;
    exploreProduct: string;
    ctaContact: string;
    ctaCheckup: string;
    empty: string;
    back: string;
    share: string;
  };
  services: {
    heading: string;
    sub: string;
    items: Array<{ name: string; desc: string; points: string[]; changes: string; problem: string; stack: string[] }>;
    explore: string;
  };
  servicesPage: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    deliverables: string;
    processTitle: string;
    processSub: string;
    process: Array<{ name: string; desc: string }>;
    tabs: { problem: string; deliverables: string; stack: string; changes: string };
    stackNote: string;
    /** "How this becomes real" — per-service step flow (index = services.items order). */
    flowTitle: string;
    flows: string[][];
    groups: Array<{
      key: string;
      system: string;
      title: string;
      desc: string;
      problem: string;
      deliverables: string[];
      stack: string[];
      changes: string;
    }>;
  };
  products: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    heading: string;
    sub: string;
    statusLive: string;
    statusSoon: string;
    statusExp: string;
    liveDemo: string;
    overviewCta: string;
    /** Real CTA on cards without a public URL: opens the contact form about this product. */
    enquireCta: string;
    /** Contact message prefill; {product} is replaced with the product name. */
    enquirePrefill: string;
    items: Array<{
      key: string;
      name: string;
      category: string;
      desc: string;
      status: 'live' | 'soon' | 'exp';
      url?: string;
      cta: string;
      capabilities: string[];
    }>;
  };
  about: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    heading: string;
    sub: string;
    storyTitle: string;
    story1: string;
    story2: string;
    story3: string;
    valuesTitle: string;
    valuesSub: string;
    values: Array<{ title: string; body: string }>;
    manifesto: string[];
    stackTitle: string;
    stackSub: string;
    /** "How we're built" — compact operational layer. */
    builtTitle: string;
    builtLines: string[];
  };
  work: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    heading: string;
    sub: string;
    sector: string;
    market: string;
    year: string;
    servicesLabel: string;
    problem: string;
    approach: string;
    solution: string;
    result: string;
    viewCase: string;
    backToWork: string;
    allWork: string;
    filterAll: string;
    filterClients: string;
    filterConcepts: string;
    filterProducts: string;
    metricNote: string;
    quoteLabel: string;
    resultPeriod: string;
    resultBaseline: string;
    resultBasis: string;
    empty: string;
    statusClient: string;
    statusConcept: string;
    statusProduct: string;
    statusVenture: string;
    statusExp: string;
    designedOutcome: string;
    liveLabel: string;
    /** Label above the concept screen composition on case studies. */
    screensLabel: string;
    /** Restrained authenticity note under the status label on concept case studies. */
    conceptNote: string;
  };
  contact: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    heading: string;
    description: string;
    name: string;
    email: string;
    company: string;
    message: string;
    submit: string;
    /** Neutral fallback; the live text comes from lib/responseCopy.ts. */
    success: string;
    based: string;
    addressLabel: string;
    direct: string;
    website: string;
    plannerSystems: string;
    plannerBudget: string;
    systems: string[];
    budgets: string[];
    phone: string;
    launchLabel: string;
    launches: string[];
    nextTitle: string;
    nextSteps: string[];
    scheduleTitle: string;
    scheduleSub: string;
    calendlyUrl: string;
  };
  /** Privacy notice (Aydınlatma Metni) links next to the forms and in the footer. */
  legal: {
    formNoticeBefore: string;
    formNoticeLink: string;
    formNoticeAfter: string;
    noticeTitle: string;
  };
  cookies: {
    text: string;
    acceptAll: string;
    essentialOnly: string;
  };
  notFound: {
    heading: string;
    text: string;
    back: string;
  };
  errorPage: {
    heading: string;
    text: string;
    retry: string;
  };
  common: {
    languageSwitcher: string;
    loading: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    /** Words in the H1 that get the controlled lime underline emphasis. */
    emphasis: string[];
    primaryCta: string;
    secondaryCta: string;
    line: string;
  };
  systems: {
    heading: string;
    sub: string;
    items: Array<{ name: string; tagline: string; body: string; points: string[] }>;
  };
  clients: { heading: string; sub: string };
  partners: {
    heading: string;
    sub: string;
    categories: Array<{ name: string; tools: string[] }>;
  };
  clocks: { heading: string; sub: string; active: string; istanbul: string; baku: string; london: string; dubai: string };
  team: { heading: string; sub: string; linkedin: string };
  cta: { heading: string; body: string; button: string };
  /** Home page (2026 redesign): hero links, selected work, services, process, Check-Up, closing. */
  home: {
    ctaWork: string;
    ctaBrief: string;
    reelLabel: string;
    workEyebrow: string;
    workTitle: string;
    workAll: string;
    servicesTitle: string;
    relatedWork: string;
    serviceLink: string;
    processEyebrow: string;
    processTitle: string;
    processSub: string;
    process: Array<{ name: string; desc: string }>;
    checkupHow: string;
    checkupSteps: Array<{ title: string; desc: string }>;
    checkupLooks: string;
    insightsTitle: string;
    closingChannels: string;
    channelEmail: string;
    channelForm: string;
  };
  /** Project detail (2026 layout). */
  caseView: { nextProject: string; desktop: string; mobile: string; inUse: string; visitSite: string };
  footer: {
    message: string;
    rights: string;
    company: string;
    connect: string;
    hook: string;
    hookCta: string;
    colSystems: string;
    colProducts: string;
    exploreProducts: string;
    gatewayProject: string;
    gatewayCheckup: string;
    gatewayProducts: string;
  };
  checkup: {
    eyebrow: string;
    title: string;
    description: string;
    introTitle: string;
    introSub: string;
    /** Sample score visualisation (clearly labelled as an example). */
    sampleTitle: string;
    sampleLabel: string;
    sampleNote: string;
    introStart: string;
    introPoints: string[];
    sectionWord: string;
    sections: Array<{ key: string; label: string }>;
    step: string;
    of: string;
    next: string;
    back: string;
    submit: string;
    contactTitle: string;
    contactDesc: string;
    name: string;
    company: string;
    email: string;
    phone: string;
    /** Neutral fallback; the live text comes from lib/responseCopy.ts. */
    success: string;
    errorRequired: string;
    errorEmail: string;
    errorGeneric: string;
    questions: CheckupQuestion[];
  };
}

const en: Dict = {
  meta: {
    homeTitle: 'Yoca — Creative Growth Partner',
    homeDescription:
      'Yoca builds brands, digital experiences, growth systems and digital products through strategy, design, technology and performance.',
    checkupTitle: 'Free Digital Check-Up — Measure Your Digital Health | Yoca',
    checkupDescription:
      'Answer a short set of questions and get a personal analysis of your digital presence: website, SEO, ads, social and growth setup.',
  },
  nav: { home: 'Home', about: 'About', services: 'Services', work: 'Work', products: 'Products', checkup: 'Digital Check-Up', contact: 'Contact', insights: 'Insights' },
  overview: {
    metaTitle: 'Meet Yoca — 90-second company overview',
    metaDescription: 'Who Yoca is, why it exists, what it does, how it works, what it builds and where it operates — in about ninety seconds.',
    title: 'Meet Yoca',
    identity: 'Your Own Creative Agency',
    cover: 'Ideas into brands. Brands into systems built to grow.',
    coverLines: ['Ideas into brands.', 'Brands into systems that grow.'],
    menuLabel: 'Menu',
    sceneOf: 'Scene {n} of {total}',
    systems: [
      { short: 'Brand', descriptor: 'Positioning and identity', steps: ['Position', 'Language', 'Identity', 'Experience'] },
      { short: 'Growth', descriptor: 'Measurable growth', steps: ['Attention', 'Conversion', 'Measurement', 'Optimisation'] },
      { short: 'Scale', descriptor: 'Systems that scale', steps: ['Automation', 'Product', 'Infrastructure', 'Scale'] },
    ],
    whoHeading: 'How we’re built.',
    cue: 'Discover Yoca',
    menu: ['Intro', 'Yoca', 'Why', 'Systems', 'Services', 'Process', 'Work', 'Products', 'About', 'Global', 'Contact'],
    backToSite: 'Back to the full site',
    scene: 'Scene',
    whatHeading: 'Not an agency. A connected growth system.',
    whatSub: 'Strategy, identity, experience, technology and growth — designed and run as one system.',
    whatWords: ['Strategy', 'Identity', 'Experience', 'Technology', 'Growth'],
    whyLines: ['Your brand can be good.', 'Your website can be good.', 'Your ads can work.', 'Your technology can be strong.'],
    whyConclusion: 'But if they are not connected, it is not a growth system.',
    systemsCaption: 'One methodology. Three connected systems.',
    servicesCta: 'Explore all services',
    processHeading: 'How we work',
    processLines: ['Context before assumptions.', 'One clear direction.', 'Strategy becomes real.', 'Ship. Measure. Learn.', 'Improve what works.'],
    workLabel: 'Selected work',
    workCta: 'See selected work',
    productsOpen: 'We build for clients.',
    productsReveal: 'We build for ourselves too.',
    productsCta: 'Explore products',
    whoLines: ['Compact team.', 'Senior thinking.', 'Built around the problem.'],
    whoTraits: ['Independent', 'Multidisciplinary', 'Accountable'],
    whoFormula: 'Strategy + Creative + Technology + Growth',
    globalLine: 'Based in Türkiye. Working beyond borders.',
    finalSmall: 'So — what do we build next?',
    finalLarge: 'Let’s build what’s next.',
    pathProject: 'Start a project',
    pathCheckup: 'Not sure where to begin?',
    pathCheckupSub: 'Free Digital Check-Up',
    pathSite: 'Explore the full site',
  },
  insights: {
    metaTitle: 'Insights — Thinking behind the work | Yoca',
    metaDescription: 'Perspectives from Yoca on strategy, brand, digital experiences, growth, AI and products — the thinking behind the systems we build.',
    eyebrow: 'Yoca Insights',
    heading: 'The thinking behind the work.',
    sub: 'Perspectives on strategy, brand, digital experiences, growth, AI and products — written from the inside of the systems we build.',
    featured: 'Featured',
    latest: 'Latest insights',
    all: 'All',
    minRead: 'min read',
    by: 'By',
    related: 'Related insights',
    sources: 'Sources',
    faq: 'Frequently asked',
    ctaLine: 'Want to work through this in your own system?',
    exploreService: 'Explore the service',
    exploreProduct: 'Explore the product',
    ctaContact: 'Start a project',
    ctaCheckup: 'Free Digital Check-Up',
    empty: 'New insights are on the way. In the meantime, explore how we work.',
    back: 'All insights',
    share: 'Share',
  },
  services: {
    heading: 'What we build around your next move.',
    sub: 'We do not begin by selling a predefined package. We identify what needs to change, then combine the right capabilities around it.',
    items: [
      { name: 'Brand Strategy & Identity', desc: 'Positioning, naming, verbal identity and visual systems built to make the brand clear, relevant and recognisable.', points: ['Positioning & brand architecture', 'Naming & verbal identity', 'Visual identity systems', 'Brand guidelines & rollout'], changes: 'The brand stops blending in: one clear position, one voice, one identity everywhere.', problem: 'The brand blends in: positioning is unclear, the identity is applied inconsistently and the message changes with whoever is speaking.', stack: ['Figma', 'Frontify', 'Notion', 'Adobe Creative Cloud'] },
      { name: 'Web & Digital Experiences', desc: 'Corporate websites, platforms and conversion-focused digital experiences designed around real user behaviour.', points: ['UX architecture & prototyping', 'Corporate & campaign websites', 'E-commerce experiences', 'Performance, accessibility & SEO foundations'], changes: 'The website turns from a brochure into your best-performing salesperson.', problem: 'Visitors arrive, but the journey is unclear: the website explains the brand without efficiently guiding people toward an action, and it is not built to be measured.', stack: ['Next.js', 'Vercel', 'Figma', 'GA4', 'Google Tag Manager'] },
      { name: 'Growth & Performance', desc: 'Acquisition, performance marketing, analytics and optimisation connected through one measurable growth model.', points: ['Google, Meta & TikTok campaigns', 'Conversion tracking & analytics setup', 'SEO & content strategy', 'CRO & landing page optimisation'], changes: 'Marketing spend becomes a measured system, not a monthly gamble.', problem: 'Campaigns may bring traffic, but acquisition, conversion and measurement live in separate places — so growth is hard to read and harder to optimise.', stack: ['Google Ads', 'Meta Ads', 'GA4', 'Meta CAPI', 'Semrush', 'Hotjar'] },
      { name: 'Creative Production', desc: 'Campaign ideas, social content, advertising creatives and visual systems made to earn attention.', points: ['Campaign concepts', 'Social media content systems', 'Ad creatives & motion', 'Art direction'], changes: 'Content stops chasing trends and starts building recognition.', problem: 'Creative output is inconsistent: formats are produced one by one, campaigns lack a system, and content cannot scale without losing quality.', stack: ['Adobe Creative Cloud', 'Figma', 'After Effects', 'Notion'] },
      { name: 'AI & Automation', desc: 'Practical AI tools and automated workflows that reduce repetition, accelerate decisions and improve operations.', points: ['Workflow automation', 'AI-assisted content pipelines', 'Chat & support assistants', 'Internal tools & integrations'], changes: 'Hours of repetitive work shrink into automated, reliable flows.', problem: 'Repetitive manual work slows the team down: information moves between tools by hand, decisions wait for people, and nothing is automated with a review step.', stack: ['OpenAI API', 'Zapier / Make', 'Supabase', 'Cloudflare Workers'] },
      { name: 'Digital Product Development', desc: 'From idea validation to MVP and launch, we design and develop useful digital products with room to scale.', points: ['Idea validation & scoping', 'MVP design & development', 'Product iteration & analytics', 'Launch & growth support'], changes: 'Ideas stop waiting: validated, built and launched with room to scale.', problem: 'Good product ideas stall: MVP scope is unclear, product, design and development decisions are disconnected, and the opportunity never becomes a shipped product.', stack: ['Next.js', 'Supabase', 'Vercel', 'Figma', 'Cloudflare'] },
    ],
    explore: 'Explore',
  },
  servicesPage: {
    metaTitle: 'Services — Strategy, Design, Growth & Product | Yoca',
    metaDescription: 'Explore Yoca services: brand strategy, web and digital experiences, growth and performance, creative production, AI automation and digital product development.',
    eyebrow: 'Services',
    deliverables: 'What this covers',
    processTitle: 'One process. No black boxes.',
    processSub: 'Every engagement follows the same transparent rhythm, so you always know where the work stands and why.',
    process: [
      { name: 'Understand', desc: 'We map your market, audience and current setup — decisions start from evidence, not assumptions.' },
      { name: 'Define', desc: 'Together we agree on the change that matters most and the clearest route to it.' },
      { name: 'Build', desc: 'Strategy, design and engineering work side by side in short, reviewable cycles.' },
      { name: 'Launch', desc: 'Nothing ships by accident: staging review, content checks and a clean production release.' },
      { name: 'Grow', desc: 'We measure, report openly and keep optimising what the data proves is working.' },
    ],
    tabs: { problem: 'The problem it solves', deliverables: 'Deliverables', stack: 'Tech stack', changes: 'What changes' },
    stackNote: 'Tools are chosen for the problem — never the other way around.',
    flowTitle: 'How this becomes real.',
    flows: [['Position', 'Language', 'Identity', 'Experience'], ['Strategy', 'UX', 'Interface', 'Build', 'Measure'], ['Acquire', 'Convert', 'Measure', 'Optimise'], ['Idea', 'System', 'Produce', 'Adapt', 'Deploy'], ['Trigger', 'Process', 'Intelligence', 'Review', 'Action'], ['Problem', 'Flow', 'Prototype', 'Build', 'Iterate']],
    groups: [
      {
        key: 'brand',
        system: 'Yoca Brand System™',
        title: 'Brand & Creative',
        desc: 'Brand strategy, identity and creative production united under one system that makes the brand clear, relevant and impossible to confuse.',
        problem: 'The brand is invisible or interchangeable: unclear positioning, an inconsistent identity and creative work that fails to earn attention.',
        deliverables: ['Positioning & brand architecture', 'Naming & verbal identity', 'Visual identity systems', 'Campaign concepts & art direction', 'Social content systems', 'Ad creatives & motion'],
        stack: ['Figma', 'Adobe Creative Cloud', 'Notion', 'Frontify'],
        changes: 'A clearer market position, a more recognisable identity and a consistent creative foundation.',
      },
      {
        key: 'growth',
        system: 'Yoca Growth Engine™',
        title: 'Growth & Digital Experience',
        desc: 'Conversion-focused digital experiences and performance marketing connected into one measurable growth engine.',
        problem: 'Traffic without conversion, ads without tracking — a website that looks fine but does not sell, and no single number that tells the truth.',
        deliverables: ['UX architecture & conversion-focused websites', 'E-commerce experiences', 'Google / Meta / TikTok campaigns', 'Tracking, analytics & attribution', 'SEO & content strategy', 'CRO & landing page optimisation'],
        stack: ['Next.js', 'GA4', 'Google Tag Manager', 'Meta CAPI', 'Semrush', 'Hotjar'],
        changes: 'A more measurable path from attention to action, with clearer journeys and stronger optimisation signals.',
      },
      {
        key: 'scale',
        system: 'Yoca Scale Framework™',
        title: 'Product & Automation',
        desc: 'AI automation and digital product development that let the business grow without growing its complexity.',
        problem: 'Operations drown in repetition and good ideas never ship: no MVP discipline, no automation, no product ecosystem.',
        deliverables: ['Workflow automation', 'AI-assisted content pipelines', 'Chat & support assistants', 'Idea validation & MVP development', 'Product iteration & analytics', 'Launch & growth support'],
        stack: ['Supabase', 'Vercel', 'OpenAI API', 'Zapier / Make', 'Cloudflare'],
        changes: 'A more scalable operating model with fewer repetitive tasks and a stronger digital product foundation.',
      },
    ],
  },
  products: {
    metaTitle: 'Products — YocaServe, WonKick, YocaStudio, Demo Hub & Labs | Yoca',
    metaDescription: 'Yoca’s own product ecosystem: YocaServe, WonKick, YocaStudio, Yoca Demo Hub and Yoca Labs — built and grown with the same systems we apply to client brands.',
    eyebrow: 'Yoca Products',
    heading: 'Products we build and grow ourselves.',
    sub: 'Our product ecosystem is where the Yoca methodology is tested in practice—the same strategic, creative and technical systems we bring to client work, applied to products we build ourselves.',
    statusLive: 'Live',
    statusSoon: 'In Development',
    statusExp: 'Experimental',
    liveDemo: 'Live Demo',
    overviewCta: 'View Product Overview',
    enquireCta: 'Ask about this product',
    enquirePrefill: 'I would like to learn more about {product}.',
    items: [
      {
        key: 'yocaserve',
        name: 'YocaServe',
        category: 'Hospitality Tech',
        desc: 'A fast and flexible QR menu and digital service system created for restaurants, cafés, hotels and hospitality businesses.',
        status: 'live',
        cta: 'Visit YocaServe',
        capabilities: ['Multilingual', 'QR Ordering', 'Shared-Hosting Compatible'],
      },
      {
        key: 'wonkick',
        name: 'WonKick',
        category: 'Football / Interactive',
        desc: 'A football arcade hub where fans build squads, solve daily football challenges and compete through interactive game modes.',
        status: 'soon',
        cta: 'Explore WonKick',
        capabilities: ['Daily Challenges', 'Squad Builder', 'Interactive Game Modes'],
      },
      {
        key: 'yocastudio',
        name: 'YocaStudio',
        category: 'Mobile Game Studio',
        desc: 'An independent game studio within Yoca, building original, accessible and replayable mobile game experiences.',
        status: 'soon',
        cta: 'Explore YocaStudio',
        capabilities: ['Mobile-First', 'Original IP', 'Rapid Prototyping'],
      },
      {
        key: 'demo-hub',
        name: 'Yoca Demo Hub',
        category: 'Showcase',
        desc: 'A multilingual showcase of digital concepts, websites and experiences designed and developed by Yoca.',
        status: 'live',
        cta: 'Visit Demo Hub',
        capabilities: ['Multilingual', 'Live Demos', 'Modular Showcase'],
      },
      {
        key: 'labs',
        name: 'Yoca Labs',
        category: 'Creative Technology',
        desc: 'Yoca’s experimental layer for visual AI, creative technology and the next generation of digital experiences.',
        status: 'exp',
        cta: 'Explore Yoca Labs',
        capabilities: ['AI-Assisted', 'Visual Experiments', 'Rapid Prototyping'],
      },
    ],
  },
  about: {
    metaTitle: 'About Yoca — Your Own Creative Agency',
    metaDescription: 'Yoca is an independent creative growth partner connecting strategy, design, technology and performance in one system. Meet the approach, the values and the team.',
    eyebrow: 'About Yoca',
    heading: 'Close enough to think like your team. Independent enough to challenge it.',
    sub: 'Your Own Creative Agency.',
    storyTitle: 'Why we exist',
    story1: 'Most brands don’t fail because of a lack of ideas. They fail because strategy, design, technology and marketing live in separate rooms, run by separate vendors, measured by separate numbers.',
    story2: 'Yoca was built to close that gap. We work as one compact senior team around a single question: what actually needs to change for this brand to grow — and what is the clearest way to build it?',
    story3: 'That is also why we are called Your Own Creative Agency: we work embedded, transparent and accountable, closer to an in-house team than an external supplier.',
    valuesTitle: 'The principles we work by',
    valuesSub: 'Not wall posters — the actual rules that shape daily decisions on every project.',
    values: [
      { title: 'Evidence Before Assumption', body: 'Research, behaviour and performance data inform the work. We use evidence to challenge assumptions—not to replace judgement.' },
      { title: 'Outcomes Before Activity', body: 'More activity does not automatically create more value. We focus on the meaningful change the work needs to produce.' },
      { title: 'Clarity Without Black Boxes', body: 'You see the thinking, priorities and evidence behind every important decision.' },
      { title: 'Craft With Intent', body: 'Every visual and technical decision must earn its place through clarity, usefulness or performance.' },
    ],
    manifesto: ['Think clearly.', 'Build deliberately.', 'Measure honestly.', 'Improve continuously.'],
    stackTitle: 'The tools change. The system stays connected.',
    stackSub: 'The platform mix may change from project to project. What stays consistent is the way strategy, execution and measurement connect.',
    builtTitle: 'How we’re built',
    builtLines: ['Compact team.', 'Senior thinking.', 'One accountable system.', 'Built around the problem.'],
  },
  work: {
    metaTitle: 'Selected Work — Brands and Digital Experiences | Yoca',
    metaDescription: 'Selected brands, websites, platforms and digital experiences created by Yoca across different sectors and markets.',
    eyebrow: 'Selected Work',
    heading: 'Different challenges. Clear decisions. Work designed to move.',
    sub: 'Websites and digital experiences YOCA designed and built for its clients.',
    sector: 'Sector',
    market: 'Market',
    year: 'Year',
    servicesLabel: 'Services',
    problem: 'The need',
    approach: 'Yoca’s scope',
    solution: 'What was delivered',
    result: 'Verified Results',
    viewCase: 'View Project',
    backToWork: 'Back to Work',
    allWork: 'View All Work',
    filterAll: 'All',
    filterClients: 'Client Case Studies',
    filterConcepts: 'Concept Projects',
    filterProducts: 'Yoca Ventures & Products',
    metricNote: '* Metrics reflect verified, client-approved outcomes only.',
    quoteLabel: 'Client Quote',
    resultPeriod: 'Period',
    resultBaseline: 'Compared with',
    resultBasis: 'Source',
    empty: 'No projects in this category yet.',
    statusClient: 'Client Case Study',
    statusConcept: 'Concept Project',
    statusProduct: 'Yoca Product',
    statusVenture: 'Yoca Venture',
    statusExp: 'Experimental',
    designedOutcome: 'Intended Impact',
    screensLabel: 'Selected screens',
    conceptNote: 'Concept project designed and developed by Yoca.',
    liveLabel: 'View Live',
  },
  contact: {
    metaTitle: 'Contact Yoca — Start a Project',
    metaDescription: 'Tell us what you are building. Share the project, its stage and what you want to change, and we will help define the right next move.',
    eyebrow: 'Contact',
    heading: 'Let’s build the next move.',
    description: 'Tell us what you are working on, where the project stands and what you want to change. Clear context helps us start with a better conversation.',
    name: 'Full Name',
    email: 'Email Address',
    company: 'Company or Brand',
    message: 'Tell us about the project',
    submit: 'Send Project Brief',
    success: 'Your message has arrived. We will review what you shared and get back to you by e-mail.',
    based: 'Based in Türkiye. Working across markets.',
    addressLabel: 'Address',
    direct: 'Prefer email?',
    website: 'Website or current digital presence',
    plannerSystems: 'Which systems do you need?',
    plannerBudget: 'Estimated budget',
    systems: ['Yoca Brand System™', 'Yoca Growth Engine™', 'Yoca Scale Framework™', 'Digital Product', 'Not Sure Yet'],
    budgets: ['Under $5,000', '$5,000 – $15,000', '$15,000 – $40,000', '$40,000+', 'Not sure yet'],
    phone: 'Phone (optional)',
    launchLabel: 'Target launch period',
    launches: ['As soon as possible', 'Within 1–3 months', 'Within 3–6 months', 'Exploring for now'],
    nextTitle: 'What happens next?',
    nextSteps: ['We review your brief.', 'We identify the right starting point.', 'We contact you with the next step.'],
    scheduleTitle: 'Prefer to talk it through?',
    scheduleSub: 'Book a free 30-minute intro call and let’s map the right next move together.',
    calendlyUrl: '',
  },
  legal: {
    formNoticeBefore: 'Information on how we process the personal data you share in this form is in our ',
    formNoticeLink: 'Privacy Notice',
    formNoticeAfter: '.',
    noticeTitle: 'Privacy Notice',
  },
  cookies: {
    text: 'We use essential cookies to keep the website working and optional analytics cookies to understand how it is used.',
    acceptAll: 'Accept All',
    essentialOnly: 'Essential Only',
  },
  notFound: {
    heading: 'This page moved without leaving a strategy behind.',
    text: 'The page you are looking for does not exist or may have been moved.',
    back: 'Return Home',
  },
  errorPage: {
    heading: 'Something broke on our side.',
    text: 'An unexpected error occurred. Please try again in a moment.',
    retry: 'Try Again',
  },
  common: {
    languageSwitcher: 'Language',
    loading: 'Loading…',
  },
  hero: {
    eyebrow: 'Independent Creative Growth Partner',
    title: 'We design your brand and bring it to life in digital.',
    description:
      'We bring brand identity, websites, digital products and marketing together around what your project needs.',
    emphasis: ['digital'],
    primaryCta: 'Start a Project',
    secondaryCta: 'Free Digital Check-Up',
    line: 'Strategy. Identity. Experience. Growth.',
  },
  systems: {
    heading: 'One methodology. Three connected systems.',
    sub: 'Every engagement runs the same sequence — brand first, growth second, scale third — so each stage strengthens the next.',
    items: [
      {
        name: 'Yoca Brand System™',
        tagline: 'Positioning & identity',
        body: 'The positioning, message, identity and experience that give the brand a meaningful place in its market.',
        points: ['Positioning & architecture', 'Verbal & visual identity', 'Experience principles'],
      },
      {
        name: 'Yoca Growth Engine™',
        tagline: 'Measurable momentum',
        body: 'Communication, campaigns, performance and conversion connected into one repeatable growth system.',
        points: ['Performance campaigns', 'Conversion & analytics', 'Content & SEO'],
      },
      {
        name: 'Yoca Scale Framework™',
        tagline: 'Built to compound',
        body: 'The infrastructure, processes and product ecosystem needed to grow without unnecessary complexity.',
        points: ['Automation & AI', 'Product ecosystem', 'Operational tooling'],
      },
    ],
  },
  clients: { heading: 'Built by Yoca.', sub: 'Selected concepts, digital experiences and products developed through the Yoca system.' },
  partners: {
    heading: 'The tools change. The system stays connected.',
    sub: 'We select the right platforms for each project, then connect them through one clear measurement and operating model.',
    categories: [
      { name: 'Measure', tools: ['Google Analytics 4', 'Google Tag Manager', 'Search Console', 'Hotjar'] },
      { name: 'Grow', tools: ['Google Ads', 'Meta Ads', 'TikTok Ads', 'Semrush'] },
      { name: 'Build', tools: ['Next.js', 'Vercel', 'Supabase', 'Cloudflare'] },
    ],
  },
  clocks: { heading: 'Working across markets and time zones.', sub: 'Based in Türkiye. Connected to projects across Europe, the Caucasus, MENA and beyond.', active: 'Current local times across our working regions.', istanbul: 'Istanbul', baku: 'Baku', london: 'London', dubai: 'Dubai' },
  team: {
    heading: 'The people behind the system.',
    sub: 'A compact senior team — strategy, creative, engineering and growth working side by side, without layers.',
    linkedin: 'LinkedIn profile of',
  },
  cta: {
    heading: 'What are you building next?',
    body: 'Tell us where you are, where you want to go and what is standing in the way. We will help define the right next move.',
    button: 'Start the Conversation',
  },
  home: {
    ctaWork: 'Explore the work',
    ctaBrief: 'Tell us about your project',
    reelLabel: 'Selected work',
    workEyebrow: 'Selected projects',
    workTitle: 'A selection of work we designed and built.',
    workAll: 'All projects',
    servicesTitle: 'What we do',
    relatedWork: 'Our work in this area',
    serviceLink: 'Explore the service',
    processEyebrow: 'Process',
    processTitle: 'Every project moves at the same open rhythm.',
    processSub: 'We always see together which stage we are in and what comes next.',
    process: [
      { name: 'Understand', desc: 'We study your brand, your audience and where things stand today, and agree on what needs to change.' },
      { name: 'Design', desc: 'Identity, content and interface decisions take shape through drafts you can review.' },
      { name: 'Build', desc: 'The approved design becomes a fast, accessible structure your team can manage.' },
      { name: 'Launch', desc: 'After a preview review and content checks, the work goes live cleanly.' },
      { name: 'Improve', desc: 'After launch we measure, learn and refine the points that need it, together.' },
    ],
    checkupHow: 'How it works',
    checkupSteps: [
      { title: 'Answer the questions', desc: '{n} short questions about your brand, website, channels and goals.' },
      { title: 'We review your answers', desc: 'Our team reads your answers.' },
      { title: 'See your priorities', desc: 'We email you a prioritised assessment and clear next steps.' },
    ],
    checkupLooks: 'What we look at',
    insightsTitle: 'Latest from Insights',
    closingChannels: 'Reach us directly',
    channelEmail: 'Email',
    channelForm: 'Contact form',
  },
  caseView: {
    nextProject: 'Next project',
    desktop: 'Desktop',
    mobile: 'Mobile',
    inUse: 'In use',
    visitSite: 'Visit the site',
  },
  footer: {
    message: 'Good ideas deserve a system built to move them forward.',
    rights: 'Yoca. Your Own Creative Agency. All rights reserved.',
    company: 'Company',
    connect: 'Connect',
    hook: 'What should we build together next?',
    hookCta: 'Start a Project',
    colSystems: 'Systems',
    colProducts: 'Products',
    exploreProducts: 'Explore Yoca Products',
    gatewayProject: 'For brands ready to define and build their next move.',
    gatewayCheckup: 'For businesses that need a clearer view of what to improve first.',
    gatewayProducts: 'See the digital products we build, test and grow inside Yoca.',
  },
  checkup: {
    eyebrow: 'Digital Check-Up',
    title: 'How healthy is your digital presence?',
    description:
      'Answer a few short questions about your brand, channels and goals. We will review your answers and prepare a personal digital analysis with clear next steps.',
    introTitle: 'Let’s review where your brand stands online.',
    sampleTitle: 'Digital health',
    sampleLabel: 'Sample result',
    sampleNote: 'Example values for illustration — your real report is prepared from your own answers.',
    introSub:
      'Answer 16 focused questions about your brand, website, channels, measurement and growth readiness. We review your answers and send you a prioritised assessment with clear next steps.',
    introStart: 'Start My Check-Up',
    introPoints: ['About 3 minutes to answer', '16 focused questions', 'Reviewed by a person, not sent automatically', 'Clear next steps'],
    sectionWord: 'Section',
    sections: [
      { key: 'business', label: 'Business' },
      { key: 'website', label: 'Website' },
      { key: 'marketing', label: 'Marketing' },
      { key: 'brand', label: 'Brand' },
      { key: 'measurement', label: 'Measurement' },
      { key: 'goals', label: 'Goals' },
    ],
    step: 'Step',
    of: 'of',
    next: 'Next',
    back: 'Back',
    submit: 'Get My Analysis',
    contactTitle: 'Almost done. Where should we send your analysis?',
    contactDesc: 'We review every check-up personally and reply with a short, honest assessment.',
    name: 'Full Name',
    company: 'Company or Brand',
    email: 'Email Address',
    phone: 'Phone Number',
    success: 'Your answers have arrived. We will prepare your assessment and send it to your e-mail address.',
    errorRequired: 'Please fill in the required fields.',
    errorEmail: 'Please enter a valid email address.',
    errorGeneric: 'Something went wrong. Please try again or email us directly.',
    questions: [
      { key: 'sector', title: 'Which sector are you in?', options: ['E-commerce / Retail', 'Professional Services', 'Hospitality / Tourism', 'Healthcare', 'Technology / SaaS', 'Real Estate / Construction', 'Other'] },
      { key: 'audience', title: 'Who do you sell to?', options: ['Businesses (B2B)', 'Consumers (B2C)', 'Both'] },
      { key: 'size', title: 'How big is your team?', options: ['Just me', '2–10 people', '11–50 people', '50+ people'] },
      { key: 'website', title: 'How would you describe your website?', options: ['We don’t have one', 'Old — we’re not proud of it', 'New, but it doesn’t bring results', 'Current and performing well'] },
      { key: 'mobile', title: 'Is your website comfortable to use on a phone?', options: ['No / not sure', 'Partly', 'Yes, fully mobile-friendly'] },
      { key: 'ecommerce', title: 'Do you sell online?', options: ['No online sales', 'Through marketplaces only', 'Our own online store', 'Own store + marketplaces'] },
      { key: 'seo', title: 'What is your SEO situation?', options: ['Never worked on it', 'Tried before, then stopped', 'Ongoing but limited', 'Strong organic traffic'] },
      { key: 'content', title: 'How often do you publish content?', options: ['Rarely / never', 'Occasionally', 'Regularly with a plan'] },
      { key: 'google_ads', title: 'Are you running Google Ads?', options: ['No', 'We did in the past', 'Yes, managing it ourselves', 'Yes, with professional management'] },
      { key: 'meta_ads', title: 'Are you running Meta (Instagram / Facebook) ads?', options: ['No', 'We did in the past', 'Yes, managing it ourselves', 'Yes, with professional management'] },
      { key: 'other_channels', title: 'Any other active channels?', options: ['None', 'TikTok', 'LinkedIn', 'YouTube', 'More than one of these'] },
      { key: 'social', title: 'How active is your social media?', options: ['Inactive', 'Irregular posting', 'Regular posting', 'Strong, engaged community'] },
      { key: 'analytics', title: 'How do you measure your results?', options: ['We don’t measure', 'Analytics installed but unused', 'We check reports regularly', 'Full tracking with conversions'] },
      { key: 'crm', title: 'How do you track leads and customers?', options: ['We don’t track them', 'Spreadsheets / notes', 'A basic CRM tool', 'Integrated CRM with automation'] },
      { key: 'budget', title: 'What is your monthly marketing budget?', options: ['No fixed budget', 'Under $1,000', '$1,000 – $5,000', '$5,000+'] },
      { key: 'goal', title: 'What is your main growth goal?', options: ['Brand awareness', 'More leads and enquiries', 'Online sales growth', 'Launching a new market or product', 'More efficiency from what we have'] },
    ],
  },
};

const tr: Dict = {
  meta: {
    homeTitle: 'Yoca — Yaratıcı Büyüme Partneri',
    homeDescription:
      'Yoca; strateji, tasarım, teknoloji ve performansı birleştirerek markalar, dijital deneyimler, büyüme sistemleri ve ürünler geliştirir.',
    checkupTitle: 'Ücretsiz Dijital Check-Up — Dijital Sağlığınızı Ölçün | Yoca',
    checkupDescription:
      'Kısa bir soru setini yanıtlayın; web sitesi, SEO, reklam, sosyal medya ve büyüme kurulumunuz için kişisel bir analiz alın.',
  },
  nav: { home: 'Ana Sayfa', about: 'Hakkımızda', services: 'Hizmetler', work: 'Projeler', products: 'Ürünler', checkup: 'Dijital Check-Up', contact: 'İletişim', insights: 'İçgörüler' },
  overview: {
    metaTitle: 'Yoca’yı Tanıyın — 90 saniyelik şirket özeti',
    metaDescription: 'Yoca kimdir, neden var, ne yapar, nasıl çalışır, ne inşa eder ve nerede çalışır — yaklaşık doksan saniyede.',
    title: 'Yoca’yı Tanıyın',
    identity: 'Your Own Creative Agency',
    cover: 'Fikirleri markaya. Markaları büyüyen sistemlere.',
    coverLines: ['Fikirleri markaya.', 'Markaları büyüyen sistemlere.'],
    menuLabel: 'Menü',
    sceneOf: 'Sahne {n} / {total}',
    systems: [
      { short: 'Marka', descriptor: 'Konumlandırma ve kimlik', steps: ['Konum', 'Dil', 'Kimlik', 'Deneyim'] },
      { short: 'Büyüme', descriptor: 'Ölçülebilir büyüme', steps: ['Dikkat', 'Dönüşüm', 'Ölçüm', 'Optimizasyon'] },
      { short: 'Ölçek', descriptor: 'Ölçeklenebilir sistemler', steps: ['Otomasyon', 'Ürün', 'Altyapı', 'Ölçek'] },
    ],
    whoHeading: 'Nasıl bir ekibiz?',
    cue: 'Yoca’yı keşfet',
    menu: ['Giriş', 'Yoca', 'Neden', 'Sistemler', 'Hizmetler', 'Süreç', 'Projeler', 'Ürünler', 'Hakkımızda', 'Global', 'İletişim'],
    backToSite: 'Tam siteye dön',
    scene: 'Sahne',
    whatHeading: 'Bir ajans değil. Birbirine bağlı bir büyüme sistemi.',
    whatSub: 'Strateji, kimlik, deneyim, teknoloji ve büyüme — tek bir sistem olarak tasarlanır ve işletilir.',
    whatWords: ['Strateji', 'Kimlik', 'Deneyim', 'Teknoloji', 'Büyüme'],
    whyLines: ['Markanız iyi olabilir.', 'Web siteniz iyi olabilir.', 'Reklamınız çalışabilir.', 'Teknolojiniz güçlü olabilir.'],
    whyConclusion: 'Ama birbirine bağlı değillerse, bu bir büyüme sistemi değildir.',
    systemsCaption: 'Tek metodoloji. Birbirine bağlı üç sistem.',
    servicesCta: 'Tüm hizmetleri keşfet',
    processHeading: 'Nasıl çalışıyoruz',
    processLines: ['Varsayımdan önce bağlam.', 'Tek ve net bir yön.', 'Strateji gerçeğe dönüşür.', 'Yayınla. Ölç. Öğren.', 'İşe yarayanı geliştir.'],
    workLabel: 'Seçili işler',
    workCta: 'Seçili işleri incele',
    productsOpen: 'Müşteriler için inşa ediyoruz.',
    productsReveal: 'Kendimiz için de inşa ediyoruz.',
    productsCta: 'Ürünleri keşfet',
    whoLines: ['Kompakt ekip.', 'Kıdemli bakış.', 'Problemin etrafında kurulu.'],
    whoTraits: ['Bağımsız', 'Çok disiplinli', 'Sorumlu'],
    whoFormula: 'Strateji + Yaratıcılık + Teknoloji + Büyüme',
    globalLine: 'Türkiye merkezli. Sınırların ötesinde çalışıyoruz.',
    finalSmall: 'Peki, sırada ne inşa ediyoruz?',
    finalLarge: 'Sıradakini birlikte inşa edelim.',
    pathProject: 'Projeyi başlat',
    pathCheckup: 'Nereden başlayacağınızdan emin değil misiniz?',
    pathCheckupSub: 'Ücretsiz Dijital Check-Up',
    pathSite: 'Tam siteyi keşfet',
  },
  insights: {
    metaTitle: 'İçgörüler — İşin arkasındaki düşünce | Yoca',
    metaDescription: 'Yoca’dan strateji, marka, dijital deneyimler, büyüme, yapay zekâ ve ürünler üzerine bakış açıları — kurduğumuz sistemlerin arkasındaki düşünce.',
    eyebrow: 'Yoca İçgörüler',
    heading: 'İşin arkasındaki düşünce.',
    sub: 'Strateji, marka, dijital deneyimler, büyüme, yapay zekâ ve ürünler üzerine bakış açıları — kurduğumuz sistemlerin içinden yazıldı.',
    featured: 'Öne çıkan',
    latest: 'Son içgörüler',
    all: 'Tümü',
    minRead: 'dk okuma',
    by: 'Yazan',
    related: 'İlgili içgörüler',
    sources: 'Kaynaklar',
    faq: 'Sık sorulanlar',
    ctaLine: 'Bu konuyu kendi sisteminizde ele almak ister misiniz?',
    exploreService: 'Hizmeti keşfet',
    exploreProduct: 'Ürünü keşfet',
    ctaContact: 'Projeyi başlat',
    ctaCheckup: 'Ücretsiz Dijital Check-Up',
    empty: 'Yeni içgörüler yolda. Bu arada nasıl çalıştığımıza göz atın.',
    back: 'Tüm içgörüler',
    share: 'Paylaş',
  },
  services: {
    heading: 'Bir sonraki adımınızın ihtiyaç duyduğu yapıyı kuruyoruz.',
    sub: 'Önceden hazırlanmış bir paket satarak başlamayız. Değişmesi gereken noktayı belirler, doğru yetkinlikleri bunun etrafında birleştiririz.',
    items: [
      { name: 'Marka Stratejisi ve Kimlik', desc: 'Markayı net, anlamlı ve ayırt edilebilir hâle getiren konumlandırma, isimlendirme, marka dili ve görsel kimlik sistemleri.', points: ['Konumlandırma ve marka mimarisi', 'İsimlendirme ve marka dili', 'Görsel kimlik sistemleri', 'Marka rehberi ve uygulama'], changes: 'Marka sıradanlıktan çıkar: her yerde tek net konum, tek ses, tek kimlik.', problem: 'Marka neyi temsil ettiğini, neden farklı olduğunu ve neden tercih edilmesi gerektiğini yeterince net anlatamıyorsa kimlik, mesaj ve deneyim parçaları zamanla birbirinden kopar.', stack: ['Figma', 'Frontify', 'Notion', 'Adobe Creative Cloud'] },
      { name: 'Web ve Dijital Deneyimler', desc: 'Gerçek kullanıcı davranışlarına göre tasarlanan kurumsal siteler, platformlar ve dönüşüm odaklı dijital deneyimler.', points: ['UX mimarisi ve prototipleme', 'Kurumsal ve kampanya siteleri', 'E-ticaret deneyimleri', 'Performans, erişilebilirlik ve SEO altyapısı'], changes: 'Web sitesi broşür olmaktan çıkıp en iyi performans gösteren satışçınıza dönüşür.', problem: 'Ziyaretçi siteye geliyor ancak yolculuk net değil; içerik markayı anlatırken kullanıcıyı bir sonraki adıma yeterince yönlendirmiyor. Sonuç, iyi görünen fakat iş hedeflerine yeterince hizmet etmeyen bir dijital deneyim.', stack: ['Next.js', 'Vercel', 'Figma', 'GA4', 'Google Tag Manager'] },
      { name: 'Büyüme ve Performans', desc: 'Tek bir ölçülebilir büyüme modeli altında birleştirilen müşteri kazanımı, performans pazarlaması, analiz ve optimizasyon.', points: ['Google, Meta ve TikTok kampanyaları', 'Dönüşüm takibi ve analitik kurulumu', 'SEO ve içerik stratejisi', 'CRO ve açılış sayfası optimizasyonu'], changes: 'Pazarlama harcaması aylık bir kumar değil, ölçülen bir sisteme dönüşür.', problem: 'Trafik ve kampanyalar çalışıyor olabilir; ancak kazanım, dönüşüm ve ölçüm birbirinden kopuk ilerlediğinde hangi yatırımın gerçekten büyüme ürettiği net biçimde görülemez.', stack: ['Google Ads', 'Meta Ads', 'GA4', 'Meta CAPI', 'Semrush', 'Hotjar'] },
      { name: 'Yaratıcı Üretim', desc: 'Dikkat kazanmak için geliştirilen kampanya fikirleri, sosyal medya içerikleri, reklam kreatifleri ve görsel sistemler.', points: ['Kampanya konseptleri', 'Sosyal medya içerik sistemleri', 'Reklam kreatifleri ve motion', 'Sanat yönetimi'], changes: 'İçerik trend kovalamayı bırakır, bilinirlik inşa etmeye başlar.', problem: 'Güçlü bir marka kimliği tek başına yeterli değildir. Kampanyalar, sosyal içerikler ve farklı formatlardaki yaratıcı üretim ortak bir sistem olmadan ilerlediğinde marka her temas noktasında farklı görünmeye başlar.', stack: ['Adobe Creative Cloud', 'Figma', 'After Effects', 'Notion'] },
      { name: 'Yapay Zekâ ve Otomasyon', desc: 'Tekrarlayan işleri azaltan, karar süreçlerini hızlandıran ve operasyonu geliştiren uygulanabilir yapay zekâ araçları ve otomasyonlar.', points: ['İş akışı otomasyonu', 'Yapay zekâ destekli içerik süreçleri', 'Sohbet ve destek asistanları', 'Kurum içi araçlar ve entegrasyonlar'], changes: 'Saatler süren tekrarlı işler otomatik ve güvenilir akışlara iner.', problem: 'Tekrarlayan işler hâlâ insan zamanı tüketiyor; bilgi farklı araçlar arasında manuel taşınıyor ve süreçler ölçeklendikçe operasyon daha yavaş ve hataya açık hâle geliyor.', stack: ['OpenAI API', 'Zapier / Make', 'Supabase', 'Cloudflare Workers'] },
      { name: 'Dijital Ürün Geliştirme', desc: 'Fikir doğrulamadan MVP ve yayına kadar ölçeklenebilir, kullanılabilir dijital ürünler tasarlar ve geliştiririz.', points: ['Fikir doğrulama ve kapsam', 'MVP tasarımı ve geliştirme', 'Ürün iterasyonu ve analitik', 'Lansman ve büyüme desteği'], changes: 'Fikirler beklemeyi bırakır: doğrulanır, inşa edilir ve ölçeklenebilir şekilde yayına alınır.', problem: 'İyi fikirler; net kapsam, doğru ürün akışı ve MVP disiplini kurulmadığında kullanılabilir bir ürüne dönüşemiyor. Tasarım, teknoloji ve iş hedefleri birbirinden ayrı ilerledikçe ürün karmaşıklaşıyor.', stack: ['Next.js', 'Supabase', 'Vercel', 'Figma', 'Cloudflare'] },
    ],
    explore: 'İncele',
  },
  servicesPage: {
    metaTitle: 'Hizmetler — Strateji, Tasarım, Büyüme ve Ürün | Yoca',
    metaDescription: 'Yoca hizmetlerini keşfedin: marka stratejisi, web ve dijital deneyimler, büyüme ve performans, yaratıcı üretim, yapay zekâ otomasyonu ve dijital ürün geliştirme.',
    eyebrow: 'Hizmetler',
    deliverables: 'Neleri kapsar',
    processTitle: 'Tek süreç. Kapalı kutu yok.',
    processSub: 'Her iş birliği aynı şeffaf ritimle ilerler; işin hangi aşamada olduğunu ve nedenini her zaman bilirsiniz.',
    process: [
      { name: 'Anla', desc: 'Pazarınızı, hedef kitlenizi ve mevcut yapınızı haritalarız — kararlar varsayımdan değil, veriden başlar.' },
      { name: 'Tanımla', desc: 'En kritik değişimi ve ona giden en net rotayı birlikte belirleriz.' },
      { name: 'İnşa Et', desc: 'Strateji, tasarım ve yazılım; kısa ve incelenebilir döngülerle yan yana çalışır.' },
      { name: 'Yayına Al', desc: 'Hiçbir şey tesadüfen yayına çıkmaz: Ön izleme incelemesi, içerik kontrolleri ve temiz bir canlıya alma.' },
      { name: 'Büyüt', desc: 'Ölçer, şeffaf raporlar ve verinin işe yaradığını kanıtladığı noktaları optimize etmeye devam ederiz.' },
    ],
    tabs: { problem: 'Hangi problemi çözer?', deliverables: 'Neler teslim edilir?', stack: 'Teknoloji altyapısı', changes: 'Ne değişir?' },
    stackNote: 'Araçlar probleme göre seçilir — asla tersi değil.',
    flowTitle: 'Bu nasıl gerçeğe dönüşür.',
    flows: [['Konum', 'Dil', 'Kimlik', 'Deneyim'], ['Strateji', 'UX', 'Arayüz', 'Geliştirme', 'Ölçüm'], ['Edin', 'Dönüştür', 'Ölç', 'Optimize et'], ['Fikir', 'Sistem', 'Üret', 'Uyarla', 'Yayınla'], ['Tetik', 'Süreç', 'Zekâ', 'İnceleme', 'Aksiyon'], ['Problem', 'Akış', 'Prototip', 'Geliştirme', 'İterasyon']],
    groups: [
      {
        key: 'brand',
        system: 'Yoca Brand System™',
        title: 'Marka ve Kreatif',
        desc: 'Marka stratejisi, kimlik ve yaratıcı üretim; markayı net, anlamlı ve karıştırılamaz kılan tek bir sistem altında birleşir.',
        problem: 'Marka görünmez veya sıradan: Belirsiz konumlandırma, tutarsız kimlik ve dikkat kazanamayan kreatif işler.',
        deliverables: ['Konumlandırma ve marka mimarisi', 'İsimlendirme ve marka dili', 'Görsel kimlik sistemleri', 'Kampanya konseptleri ve sanat yönetimi', 'Sosyal medya içerik sistemleri', 'Reklam kreatifleri ve motion'],
        stack: ['Figma', 'Adobe Creative Cloud', 'Notion', 'Frontify'],
        changes: 'Daha net bir pazar konumu, daha tanınır bir kimlik ve tutarlı bir yaratıcı temel.',
      },
      {
        key: 'growth',
        system: 'Yoca Growth Engine™',
        title: 'Büyüme ve Dijital Deneyim',
        desc: 'Dönüşüm odaklı dijital deneyimler ve performans pazarlaması, tek bir ölçülebilir büyüme motorunda birleşir.',
        problem: 'Dönüşümsüz trafik, takipsiz reklam — güzel görünen ama satmayan bir site ve gerçeği söyleyen tek bir metrik bile yok.',
        deliverables: ['UX mimarisi ve dönüşüm odaklı siteler', 'E-ticaret deneyimleri', 'Google / Meta / TikTok kampanyaları', 'Takip, analitik ve atıflama', 'SEO ve içerik stratejisi', 'CRO ve açılış sayfası optimizasyonu'],
        stack: ['Next.js', 'GA4', 'Google Tag Manager', 'Meta CAPI', 'Semrush', 'Hotjar'],
        changes: 'Dikkatten aksiyona daha ölçülebilir bir yol; daha net yolculuklar ve daha güçlü optimizasyon sinyalleri.',
      },
      {
        key: 'scale',
        system: 'Yoca Scale Framework™',
        title: 'Ürün ve Otomasyon',
        desc: 'Yapay zekâ otomasyonu ve dijital ürün geliştirme; işletme, karmaşıklığı büyümeden büyüsün diye.',
        problem: 'Operasyon tekrarda boğuluyor, iyi fikirler asla yayına çıkmıyor: MVP disiplini yok, otomasyon yok, ürün ekosistemi yok.',
        deliverables: ['İş akışı otomasyonu', 'Yapay zekâ destekli içerik süreçleri', 'Sohbet ve destek asistanları', 'Fikir doğrulama ve MVP geliştirme', 'Ürün iterasyonu ve analitik', 'Lansman ve büyüme desteği'],
        stack: ['Supabase', 'Vercel', 'OpenAI API', 'Zapier / Make', 'Cloudflare'],
        changes: 'Daha az tekrarlayan iş ve daha güçlü bir dijital ürün temeliyle daha ölçeklenebilir bir işletim modeli.',
      },
    ],
  },
  products: {
    metaTitle: 'Ürünler — YocaServe, WonKick, YocaStudio, Demo Hub ve Labs | Yoca',
    metaDescription: 'Yoca’nın kendi ürün ekosistemi: YocaServe, WonKick, YocaStudio, Yoca Demo Hub ve Yoca Labs — müşteri markalarına uyguladığımız sistemlerle inşa edilip büyütülüyor.',
    eyebrow: 'Yoca Ürünleri',
    heading: 'Kendimiz inşa edip büyüttüğümüz ürünler.',
    sub: 'Ürün ekosistemimiz, Yoca metodolojisinin pratikte test edildiği yerdir — müşteri işlerine getirdiğimiz stratejik, yaratıcı ve teknik sistemlerin, kendi geliştirdiğimiz ürünlere uygulanmış hâli.',
    statusLive: 'Yayında',
    statusSoon: 'Geliştiriliyor',
    statusExp: 'Deneysel',
    liveDemo: 'Canlı Demo',
    overviewCta: 'Ürün Özetini Gör',
    enquireCta: 'Bu ürün hakkında bilgi al',
    enquirePrefill: '{product} hakkında bilgi almak istiyorum.',
    items: [
      {
        key: 'yocaserve',
        name: 'YocaServe',
        category: 'Konaklama Teknolojisi',
        desc: 'Restoranlar, kafeler, oteller ve konaklama işletmeleri için geliştirilen hızlı ve esnek QR menü ve dijital servis sistemi.',
        status: 'live',
        cta: 'YocaServe’i Ziyaret Et',
        capabilities: ['Çok dilli', 'QR Sipariş', 'Paylaşımlı Hosting Uyumlu'],
      },
      {
        key: 'wonkick',
        name: 'WonKick',
        category: 'Futbol / İnteraktif',
        desc: 'Futbolseverlerin kadro kurduğu, günlük futbol görevlerini çözdüğü ve interaktif oyun modlarında yarıştığı bir futbol arcade merkezi.',
        status: 'soon',
        cta: 'WonKick’i Keşfet',
        capabilities: ['Günlük Görevler', 'Kadro Kurucu', 'İnteraktif Oyun Modları'],
      },
      {
        key: 'yocastudio',
        name: 'YocaStudio',
        category: 'Mobil Oyun Stüdyosu',
        desc: 'Mobil cihazlar için özgün, erişilebilir ve tekrar oynanabilir oyun deneyimleri geliştiren, Yoca bünyesindeki bağımsız oyun stüdyosu.',
        status: 'soon',
        cta: 'YocaStudio’yu Keşfet',
        capabilities: ['Önce Mobil', 'Özgün IP', 'Hızlı Prototipleme'],
      },
      {
        key: 'demo-hub',
        name: 'Yoca Demo Hub',
        category: 'Demo Platformu',
        desc: 'Yoca tarafından tasarlanan ve geliştirilen dijital konseptlerin, internet sitelerinin ve deneyimlerin çok dilli vitrini.',
        status: 'live',
        cta: 'Demo Hub’ı Ziyaret Et',
        capabilities: ['Çok dilli', 'Canlı Demolar', 'Modüler Vitrin'],
      },
      {
        key: 'labs',
        name: 'Yoca Labs',
        category: 'Yaratıcı Teknoloji',
        desc: 'Görsel yapay zekâ, yaratıcı teknoloji ve yeni nesil dijital deneyimler için Yoca’nın deneysel geliştirme alanı.',
        status: 'exp',
        cta: 'Yoca Labs’ı Keşfet',
        capabilities: ['Yapay Zekâ Destekli', 'Görsel Deneyler', 'Hızlı Prototipleme'],
      },
    ],
  },
  about: {
    metaTitle: 'Hakkımızda — Yoca | Your Own Creative Agency',
    metaDescription: 'Yoca; strateji, tasarım, teknoloji ve performansı tek sistemde birleştiren bağımsız bir yaratıcı büyüme partneridir. Yaklaşımı, değerleri ve ekibi tanıyın.',
    eyebrow: 'Hakkımızda',
    heading: 'Ekibiniz gibi düşünecek kadar yakın. Ona meydan okuyacak kadar bağımsız.',
    sub: 'Your Own Creative Agency.',
    storyTitle: 'Neden varız',
    story1: 'Çoğu marka fikir eksikliğinden başarısız olmaz. Strateji, tasarım, teknoloji ve pazarlamanın ayrı odalarda, ayrı tedarikçilerle, ayrı metriklerle yaşamasından başarısız olur.',
    story2: 'Yoca bu boşluğu kapatmak için kuruldu. Kompakt ve kıdemli tek bir ekip olarak tek bir sorunun etrafında çalışırız: Bu markanın büyümesi için gerçekte neyin değişmesi gerekiyor ve bunu inşa etmenin en net yolu ne?',
    story3: 'Adımızın Your Own Creative Agency olmasının nedeni de bu: Dışarıdan bir tedarikçi gibi değil, şirket içi bir ekibe daha yakın biçimde — gömülü, şeffaf ve hesap verebilir çalışırız.',
    valuesTitle: 'Çalışma ilkelerimiz',
    valuesSub: 'Duvar posteri değil — her projede günlük kararları şekillendiren gerçek kurallar.',
    values: [
      { title: 'Varsayımdan Önce Kanıt', body: 'İşe araştırma, davranış ve performans verisi yön verir. Kanıtı, muhakemenin yerine koymak için değil; varsayımlara meydan okumak için kullanırız.' },
      { title: 'Faaliyetten Önce Sonuç', body: 'Daha fazla faaliyet, otomatik olarak daha fazla değer üretmez. İşin üretmesi gereken anlamlı değişime odaklanırız.' },
      { title: 'Kara Kutusuz Netlik', body: 'Her önemli kararın arkasındaki düşünceyi, öncelikleri ve kanıtı görürsünüz.' },
      { title: 'Amaçlı Ustalık', body: 'Her görsel ve teknik karar; netlik, kullanışlılık veya performansla yerini hak etmek zorundadır.' },
    ],
    manifesto: ['Net düşün.', 'Bilinçli inşa et.', 'Dürüstçe ölç.', 'Sürekli geliştir.'],
    stackTitle: 'Araçlar değişir. Sistem bağlı kalır.',
    stackSub: 'Platform karması projeden projeye değişebilir. Değişmeyen şey; strateji, uygulama ve ölçümün birbirine bağlanma biçimidir.',
    builtTitle: 'Nasıl kurulduk',
    builtLines: ['Kompakt ekip.', 'Kıdemli düşünce.', 'Tek sorumlu sistem.', 'Problemin etrafında kurulu.'],
  },
  work: {
    metaTitle: 'Seçili Projeler — Markalar ve Dijital Deneyimler | Yoca',
    metaDescription: 'Yoca tarafından farklı sektörler ve pazarlar için geliştirilen seçili markalar, internet siteleri, platformlar ve dijital deneyimler.',
    eyebrow: 'Seçili Projeler',
    heading: 'Farklı ihtiyaçlar. Net kararlar. Harekete geçiren işler.',
    sub: 'YOCA’nın müşterileri için tasarlayıp geliştirdiği web siteleri ve dijital deneyimler.',
    sector: 'Sektör',
    market: 'Pazar',
    year: 'Yıl',
    servicesLabel: 'Hizmetler',
    problem: 'İhtiyaç',
    approach: 'Yoca’nın kapsamı',
    solution: 'Teslim edilen özellikler',
    result: 'Doğrulanmış Sonuçlar',
    viewCase: 'Projeyi Görüntüle',
    backToWork: 'Projelere Dön',
    allWork: 'Tüm Projeleri Gör',
    filterAll: 'Tümü',
    filterClients: 'Müşteri Projeleri',
    filterConcepts: 'Konsept Projeler',
    filterProducts: 'Yoca Girişimleri ve Ürünleri',
    metricNote: '* Metrikler yalnızca doğrulanmış ve müşteri onaylı sonuçları yansıtır.',
    quoteLabel: 'Müşteri Yorumu',
    resultPeriod: 'Dönem',
    resultBaseline: 'Karşılaştırma',
    resultBasis: 'Kaynak',
    empty: 'Bu kategoride henüz proje yok.',
    statusClient: 'Müşteri Projesi',
    statusConcept: 'Konsept Proje',
    statusProduct: 'Yoca Ürünü',
    statusVenture: 'Yoca Girişimi',
    statusExp: 'Deneysel',
    designedOutcome: 'Hedeflenen Etki',
    screensLabel: 'Seçili Ekranlar',
    conceptNote: 'Yoca tarafından tasarlanan ve geliştirilen konsept proje.',
    liveLabel: 'Canlı Görüntüle',
  },
  contact: {
    metaTitle: 'Yoca ile İletişim — Projenizi Başlatın',
    metaDescription: 'Neyi inşa ettiğinizi anlatın. Projenizi, bulunduğu aşamayı ve değiştirmek istediklerinizi paylaşın; doğru sonraki adımı birlikte tanımlayalım.',
    eyebrow: 'İletişim',
    heading: 'Bir sonraki adımı birlikte inşa edelim.',
    description: 'Üzerinde çalıştığınız projeyi, bugün hangi aşamada olduğunu ve neyi değiştirmek istediğinizi anlatın. Net bir başlangıç, daha iyi bir görüşme sağlar.',
    name: 'Ad Soyad',
    email: 'E-posta Adresi',
    company: 'Şirket veya Marka',
    message: 'Projenizi Anlatın',
    submit: 'Proje Brief’ini Gönder',
    success: 'Mesajınız ulaştı. Paylaştığınız bilgileri inceleyip e-postayla size dönüş yapacağız.',
    based: 'Türkiye merkezli. Farklı pazarlarda çalışıyoruz.',
    addressLabel: 'Adres',
    direct: 'E-posta mı tercih edersiniz?',
    website: 'Web siteniz veya mevcut dijital varlığınız',
    plannerSystems: 'Hangi sistemlere ihtiyacınız var?',
    plannerBudget: 'Tahmini bütçe',
    systems: ['Yoca Brand System™', 'Yoca Growth Engine™', 'Yoca Scale Framework™', 'Dijital Ürün', 'Henüz Emin Değilim'],
    budgets: ['5.000 $ altı', '5.000 – 15.000 $', '15.000 – 40.000 $', '40.000 $+', 'Henüz belirsiz'],
    phone: 'Telefon (opsiyonel)',
    launchLabel: 'Hedef başlangıç dönemi',
    launches: ['En kısa sürede', '1–3 ay içinde', '3–6 ay içinde', 'Şimdilik araştırıyorum'],
    nextTitle: 'Sonra ne olur?',
    nextSteps: ['Brief’inizi inceliyoruz.', 'Doğru başlangıç noktasını belirliyoruz.', 'Bir sonraki adım için sizinle iletişime geçiyoruz.'],
    scheduleTitle: 'Konuşarak ilerlemek mi istersiniz?',
    scheduleSub: 'Ücretsiz 30 dakikalık tanışma görüşmesi planlayın; doğru sonraki adımı birlikte belirleyelim.',
    calendlyUrl: '',
  },
  legal: {
    formNoticeBefore: 'Bu formda paylaştığınız kişisel verilerin işlenmesine ilişkin bilgileri ',
    formNoticeLink: 'Aydınlatma Metni',
    formNoticeAfter: '’nde bulabilirsiniz.',
    noticeTitle: 'Aydınlatma Metni',
  },
  cookies: {
    text: 'İnternet sitesinin çalışması için zorunlu çerezleri, kullanımını anlayabilmek için isteğe bağlı analiz çerezlerini kullanıyoruz.',
    acceptAll: 'Tümünü Kabul Et',
    essentialOnly: 'Yalnızca Zorunlu',
  },
  notFound: {
    heading: 'Bu sayfa, arkasında bir strateji bırakmadan taşınmış.',
    text: 'Aradığınız sayfa bulunmuyor veya başka bir adrese taşınmış olabilir.',
    back: 'Ana Sayfaya Dön',
  },
  errorPage: {
    heading: 'Bizim tarafımızda bir sorun oluştu.',
    text: 'Beklenmeyen bir hata meydana geldi. Lütfen kısa bir süre sonra tekrar deneyin.',
    retry: 'Tekrar Dene',
  },
  common: {
    languageSwitcher: 'Dil',
    loading: 'Yükleniyor…',
  },
  hero: {
    eyebrow: 'Bağımsız Yaratıcı Büyüme Partneri',
    title: 'Markanızı tasarlıyor, dijitalde hayata geçiriyoruz.',
    description:
      'Marka kimliği, web sitesi, dijital ürün ve pazarlama çalışmalarını projenizin ihtiyacına göre bir araya getiriyoruz.',
    emphasis: ['dijitalde'],
    primaryCta: 'Projeyi Başlat',
    secondaryCta: 'Ücretsiz Dijital Check-Up',
    line: 'Strateji. Kimlik. Deneyim. Büyüme.',
  },
  systems: {
    heading: 'Tek metodoloji. Birbirine bağlı üç sistem.',
    sub: 'Her iş birliği aynı sırayla ilerler — önce marka, sonra büyüme, sonra ölçek — böylece her aşama bir sonrakini güçlendirir.',
    items: [
      {
        name: 'Yoca Brand System™',
        tagline: 'Konumlandırma ve kimlik',
        body: 'Markanın pazarda anlamlı bir yer edinmesini sağlayan konumlandırma, mesaj, kimlik ve deneyim.',
        points: ['Konumlandırma ve mimari', 'Sözel ve görsel kimlik', 'Deneyim ilkeleri'],
      },
      {
        name: 'Yoca Growth Engine™',
        tagline: 'Ölçülebilir ivme',
        body: 'İletişim, kampanya, performans ve dönüşümün tekrarlanabilir tek bir büyüme sisteminde birleşmesi.',
        points: ['Performans kampanyaları', 'Dönüşüm ve analitik', 'İçerik ve SEO'],
      },
      {
        name: 'Yoca Scale Framework™',
        tagline: 'Birleşerek büyüyen yapı',
        body: 'Gereksiz karmaşa olmadan büyümek için gereken altyapı, süreçler ve ürün ekosistemi.',
        points: ['Otomasyon ve yapay zekâ', 'Ürün ekosistemi', 'Operasyonel araçlar'],
      },
    ],
  },
  clients: { heading: 'Yoca imzasıyla.', sub: 'Yoca sistemiyle geliştirilen seçili konseptler, dijital deneyimler ve ürünler.' },
  partners: {
    heading: 'Araçlar değişir. Sistem bağlı kalır.',
    sub: 'Her proje için doğru platformları seçer, sonra bunları tek bir net ölçüm ve işletim modeliyle birbirine bağlarız.',
    categories: [
      { name: 'Ölç', tools: ['Google Analytics 4', 'Google Tag Manager', 'Search Console', 'Hotjar'] },
      { name: 'Büyüt', tools: ['Google Ads', 'Meta Ads', 'TikTok Ads', 'Semrush'] },
      { name: 'İnşa Et', tools: ['Next.js', 'Vercel', 'Supabase', 'Cloudflare'] },
    ],
  },
  clocks: { heading: 'Farklı pazarlar ve saat dilimlerinde çalışıyoruz.', sub: 'Türkiye merkezli; Avrupa, Kafkasya, MENA ve ötesindeki projelere bağlıyız.', active: 'Çalıştığımız bölgelerdeki güncel yerel saatler.', istanbul: 'İstanbul', baku: 'Bakü', london: 'Londra', dubai: 'Dubai' },
  team: {
    heading: 'Sistemin arkasındaki insanlar.',
    sub: 'Katmansız çalışan kompakt bir kıdemli ekip — strateji, kreatif, yazılım ve büyüme yan yana.',
    linkedin: 'LinkedIn profili:',
  },
  cta: {
    heading: 'Sırada neyi inşa ediyorsunuz?',
    body: 'Bugün nerede olduğunuzu, nereye ulaşmak istediğinizi ve önünüzde neyin durduğunu anlatın. Doğru sonraki adımı birlikte tanımlayalım.',
    button: 'Konuşmayı Başlat',
  },
  home: {
    ctaWork: 'Projeleri İncele',
    ctaBrief: 'Projenizi Anlatın',
    reelLabel: 'Seçili iş',
    workEyebrow: 'Seçili projeler',
    workTitle: 'Tasarlayıp geliştirdiğimiz işlerden bir seçki.',
    workAll: 'Tüm projeler',
    servicesTitle: 'Neler yapıyoruz',
    relatedWork: 'Bu alandaki işimiz',
    serviceLink: 'Hizmeti incele',
    processEyebrow: 'Süreç',
    processTitle: 'Her proje aynı açık ritimle ilerler.',
    processSub: 'Hangi aşamada olduğumuzu ve bir sonraki adımı her zaman birlikte görürüz.',
    process: [
      { name: 'Anla', desc: 'Markanızı, hedef kitlenizi ve bugünkü durumu birlikte inceler, neyin değişmesi gerektiğini netleştiririz.' },
      { name: 'Tasarla', desc: 'Kimlik, içerik ve arayüz kararlarını inceleyebileceğiniz taslaklarla şekillendiririz.' },
      { name: 'Geliştir', desc: 'Onaylanan tasarımı hızlı, erişilebilir ve ekibinizin yönetebileceği bir yapıya dönüştürürüz.' },
      { name: 'Yayına al', desc: 'Önizleme incelemesi ve içerik kontrollerinden sonra işi temiz biçimde canlıya alırız.' },
      { name: 'İyileştir', desc: 'Yayından sonra ölçer, öğrenir ve gereken noktaları birlikte geliştiririz.' },
    ],
    checkupHow: 'Nasıl işler?',
    checkupSteps: [
      { title: 'Soruları yanıtlayın', desc: 'Markanız, web siteniz, kanallarınız ve hedefleriniz hakkında {n} kısa soru.' },
      { title: 'Yanıtlarınızı inceleriz', desc: 'Yanıtlarınızı ekibimiz okur.' },
      { title: 'Önceliklerinizi görün', desc: 'Önceliklendirilmiş değerlendirmeyi ve net sonraki adımları e-postanıza göndeririz.' },
    ],
    checkupLooks: 'İncelediğimiz alanlar',
    insightsTitle: 'Insights’tan son yazılar',
    closingChannels: 'Doğrudan ulaşın',
    channelEmail: 'E-posta',
    channelForm: 'İletişim formu',
  },
  caseView: {
    nextProject: 'Sıradaki proje',
    desktop: 'Masaüstü',
    mobile: 'Mobil',
    inUse: 'Kullanımda',
    visitSite: 'Siteyi ziyaret et',
  },
  footer: {
    message: 'İyi fikirler, onları ileri taşıyacak doğru sistemi hak eder.',
    rights: 'Yoca. Your Own Creative Agency. Tüm hakları saklıdır.',
    company: 'Şirket',
    connect: 'Bağlantı',
    hook: 'Sırada birlikte ne inşa edelim?',
    hookCta: 'Projeyi Başlat',
    colSystems: 'Sistemler',
    colProducts: 'Ürünler',
    exploreProducts: 'Yoca Ürünlerini Keşfet',
    gatewayProject: 'Bir sonraki hamlesini tanımlamaya ve inşa etmeye hazır markalar için.',
    gatewayCheckup: 'Önce neyi iyileştireceğine dair daha net bir görüşe ihtiyaç duyan işletmeler için.',
    gatewayProducts: 'Yoca içinde inşa ettiğimiz, test ettiğimiz ve büyüttüğümüz dijital ürünleri görün.',
  },
  checkup: {
    eyebrow: 'Dijital Check-Up',
    title: 'Dijital varlığınız ne kadar sağlıklı?',
    description:
      'Markanız, kanallarınız ve hedefleriniz hakkında birkaç kısa soruyu yanıtlayın. Yanıtlarınızı inceleyip net adımlar içeren kişisel bir dijital analiz hazırlayalım.',
    introTitle: 'Markanızın dijital durumunu birlikte değerlendirelim.',
    sampleTitle: 'Dijital sağlık',
    sampleLabel: 'Örnek sonuç',
    sampleNote: 'Gösterim amaçlı örnek değerler — gerçek raporunuz kendi yanıtlarınızdan hazırlanır.',
    introSub:
      'Markanız, web siteniz, kanallarınız, ölçümleme yapınız ve büyüme hazırlığınız hakkında 16 odaklı soruyu yanıtlayın. Yanıtlarınızı inceliyor, önceliklendirilmiş bir değerlendirme ve net sonraki adımlar gönderiyoruz.',
    introStart: 'Check-Up’ımı Başlat',
    introPoints: ['Yanıtlamak yaklaşık 3 dakika', '16 odaklı soru', 'Otomatik değil, bir kişi inceler', 'Net sonraki adımlar'],
    sectionWord: 'Bölüm',
    sections: [
      { key: 'business', label: 'İşletme' },
      { key: 'website', label: 'Web Sitesi' },
      { key: 'marketing', label: 'Pazarlama' },
      { key: 'brand', label: 'Marka' },
      { key: 'measurement', label: 'Ölçümleme' },
      { key: 'goals', label: 'Hedefler' },
    ],
    step: 'Adım',
    of: '/',
    next: 'İleri',
    back: 'Geri',
    submit: 'Analizimi Gönder',
    contactTitle: 'Neredeyse bitti. Analizinizi nereye gönderelim?',
    contactDesc: 'Her check-up başvurusunu tek tek inceliyor ve kısa, dürüst bir değerlendirmeyle dönüyoruz.',
    name: 'Ad Soyad',
    company: 'Şirket veya Marka',
    email: 'E-posta Adresi',
    phone: 'Telefon Numarası',
    success: 'Yanıtlarınız ulaştı. Değerlendirmenizi hazırlayıp e-posta adresinize göndereceğiz.',
    errorRequired: 'Lütfen zorunlu alanları doldurun.',
    errorEmail: 'Lütfen geçerli bir e-posta adresi girin.',
    errorGeneric: 'Bir sorun oluştu. Lütfen tekrar deneyin veya doğrudan e-posta gönderin.',
    questions: [
      { key: 'sector', title: 'Hangi sektördesiniz?', options: ['E-ticaret / Perakende', 'Profesyonel Hizmetler', 'Konaklama / Turizm', 'Sağlık', 'Teknoloji / SaaS', 'Gayrimenkul / İnşaat', 'Diğer'] },
      { key: 'audience', title: 'Kime satış yapıyorsunuz?', options: ['İşletmelere (B2B)', 'Tüketicilere (B2C)', 'Her ikisi'] },
      { key: 'size', title: 'Ekibiniz ne kadar büyük?', options: ['Sadece ben', '2–10 kişi', '11–50 kişi', '50+ kişi'] },
      { key: 'website', title: 'Web sitenizi nasıl tanımlarsınız?', options: ['Web sitemiz yok', 'Eski — pek gurur duymuyoruz', 'Yeni ama sonuç getirmiyor', 'Güncel ve iyi çalışıyor'] },
      { key: 'mobile', title: 'Siteniz telefonda rahat kullanılıyor mu?', options: ['Hayır / emin değilim', 'Kısmen', 'Evet, tamamen mobil uyumlu'] },
      { key: 'ecommerce', title: 'Online satış yapıyor musunuz?', options: ['Online satış yok', 'Yalnızca pazaryerlerinde', 'Kendi online mağazamız var', 'Kendi mağaza + pazaryerleri'] },
      { key: 'seo', title: 'SEO durumunuz nedir?', options: ['Hiç çalışılmadı', 'Denedik, sonra bıraktık', 'Devam ediyor ama sınırlı', 'Güçlü organik trafiğimiz var'] },
      { key: 'content', title: 'Ne sıklıkla içerik yayınlıyorsunuz?', options: ['Nadiren / hiç', 'Ara sıra', 'Planlı ve düzenli'] },
      { key: 'google_ads', title: 'Google Ads reklamı veriyor musunuz?', options: ['Hayır', 'Geçmişte verdik', 'Evet, kendimiz yönetiyoruz', 'Evet, profesyonel yönetimle'] },
      { key: 'meta_ads', title: 'Meta (Instagram / Facebook) reklamı veriyor musunuz?', options: ['Hayır', 'Geçmişte verdik', 'Evet, kendimiz yönetiyoruz', 'Evet, profesyonel yönetimle'] },
      { key: 'other_channels', title: 'Başka aktif kanalınız var mı?', options: ['Yok', 'TikTok', 'LinkedIn', 'YouTube', 'Birden fazlası'] },
      { key: 'social', title: 'Sosyal medyanız ne kadar aktif?', options: ['Aktif değil', 'Düzensiz paylaşım', 'Düzenli paylaşım', 'Güçlü ve etkileşimli topluluk'] },
      { key: 'analytics', title: 'Sonuçlarınızı nasıl ölçüyorsunuz?', options: ['Ölçmüyoruz', 'Analytics kurulu ama kullanılmıyor', 'Raporları düzenli takip ediyoruz', 'Dönüşüm takibiyle tam ölçüm'] },
      { key: 'crm', title: 'Müşteri adaylarını nasıl takip ediyorsunuz?', options: ['Takip etmiyoruz', 'Excel / notlar', 'Basit bir CRM aracı', 'Otomasyonlu entegre CRM'] },
      { key: 'budget', title: 'Aylık pazarlama bütçeniz nedir?', options: ['Sabit bütçe yok', '1.000 $ altı', '1.000 – 5.000 $', '5.000 $+'] },
      { key: 'goal', title: 'Ana büyüme hedefiniz nedir?', options: ['Marka bilinirliği', 'Daha fazla müşteri adayı', 'Online satış büyümesi', 'Yeni pazar veya ürün lansmanı', 'Mevcut yapıdan daha fazla verim'] },
    ],
  },
};

const az: Dict = {
  meta: {
    homeTitle: 'Yoca — Kreativ İnkişaf Tərəfdaşı',
    homeDescription:
      'Yoca strategiya, dizayn, texnologiya və performansı birləşdirərək brendlər, rəqəmsal təcrübələr, inkişaf sistemləri və məhsullar yaradır.',
    checkupTitle: 'Pulsuz Rəqəmsal Check-Up — Rəqəmsal Sağlamlığınızı Ölçün | Yoca',
    checkupDescription:
      'Qısa sual dəstinə cavab verin; sayt, SEO, reklam, sosial media və inkişaf quruluşunuz üçün fərdi analiz əldə edin.',
  },
  nav: { home: 'Ana səhifə', about: 'Haqqımızda', services: 'Xidmətlər', work: 'Layihələr', products: 'Məhsullar', checkup: 'Rəqəmsal Check-Up', contact: 'Əlaqə', insights: 'Baxışlar' },
  overview: {
    metaTitle: 'Yoca ilə tanış olun — 90 saniyəlik şirkət icmalı',
    metaDescription: 'Yoca kimdir, niyə var, nə edir, necə işləyir, nə qurur və harada fəaliyyət göstərir — təxminən doxsan saniyədə.',
    title: 'Yoca ilə tanış olun',
    identity: 'Your Own Creative Agency',
    cover: 'İdeyaları brendə. Brendləri böyüyən sistemlərə.',
    coverLines: ['İdeyalardan brendə.', 'Brenddən böyüyən sistemə.'],
    menuLabel: 'Menyu',
    sceneOf: 'Səhnə {n} / {total}',
    systems: [
      { short: 'Brend', descriptor: 'Mövqeləndirmə və kimlik', steps: ['Mövqe', 'Dil', 'Kimlik', 'Təcrübə'] },
      { short: 'Artım', descriptor: 'Ölçülə bilən artım', steps: ['Diqqət', 'Konversiya', 'Ölçmə', 'Optimallaşdırma'] },
      { short: 'Miqyas', descriptor: 'Miqyaslana bilən sistemlər', steps: ['Avtomatlaşdırma', 'Məhsul', 'İnfrastruktur', 'Miqyas'] },
    ],
    whoHeading: 'Necə bir komandayıq?',
    cue: 'Yoca ilə tanış ol',
    menu: ['Giriş', 'Yoca', 'Niyə', 'Sistemlər', 'Xidmətlər', 'Proses', 'Layihələr', 'Məhsullar', 'Haqqımızda', 'Qlobal', 'Əlaqə'],
    backToSite: 'Tam sayta qayıt',
    scene: 'Səhnə',
    whatHeading: 'Agentlik deyil. Bir-biri ilə bağlı artım sistemi.',
    whatSub: 'Strategiya, kimlik, təcrübə, texnologiya və artım — tək sistem kimi dizayn edilir və idarə olunur.',
    whatWords: ['Strategiya', 'Kimlik', 'Təcrübə', 'Texnologiya', 'Artım'],
    whyLines: ['Brendiniz yaxşı ola bilər.', 'Veb-saytınız yaxşı ola bilər.', 'Reklamınız işləyə bilər.', 'Texnologiyanız güclü ola bilər.'],
    whyConclusion: 'Amma bir-biri ilə bağlı deyilsə, bu, artım sistemi deyil.',
    systemsCaption: 'Vahid metodologiya. Bir-biri ilə bağlı üç sistem.',
    servicesCta: 'Bütün xidmətləri kəşf et',
    processHeading: 'Necə işləyirik',
    processLines: ['Fərziyyədən əvvəl kontekst.', 'Vahid, aydın istiqamət.', 'Strategiya reallığa çevrilir.', 'Buraxılış. Ölçmə. Öyrənmə.', 'İşləyəni təkmilləşdir.'],
    workLabel: 'Seçilmiş işlər',
    workCta: 'Seçilmiş işlərə baxın',
    productsOpen: 'Müştərilər üçün qururuq.',
    productsReveal: 'Özümüz üçün də qururuq.',
    productsCta: 'Məhsulları kəşf et',
    whoLines: ['Yığcam komanda.', 'Təcrübəli baxış.', 'Problemin ətrafında qurulub.'],
    whoTraits: ['Müstəqil', 'Çoxsahəli', 'Cavabdeh'],
    whoFormula: 'Strategiya + Kreativ + Texnologiya + Artım',
    globalLine: 'Türkiyə mərkəzli. Sərhədlərin o tayında işləyirik.',
    finalSmall: 'Bəs növbəti nə quracağıq?',
    finalLarge: 'Növbətini birlikdə quraq.',
    pathProject: 'Layihəyə başla',
    pathCheckup: 'Haradan başlayacağınızı bilmirsiniz?',
    pathCheckupSub: 'Pulsuz Rəqəmsal Check-Up',
    pathSite: 'Tam saytı kəşf et',
  },
  insights: {
    metaTitle: 'Baxışlar — İşin arxasındakı düşüncə | Yoca',
    metaDescription: 'Yoca-dan strategiya, brend, rəqəmsal təcrübələr, artım, süni intellekt və məhsullar haqqında baxışlar — qurduğumuz sistemlərin arxasındakı düşüncə.',
    eyebrow: 'Yoca Baxışlar',
    heading: 'İşin arxasındakı düşüncə.',
    sub: 'Strategiya, brend, rəqəmsal təcrübələr, artım, süni intellekt və məhsullar haqqında baxışlar — qurduğumuz sistemlərin içindən yazılıb.',
    featured: 'Seçilmiş',
    latest: 'Son baxışlar',
    all: 'Hamısı',
    minRead: 'dəq oxu',
    by: 'Müəllif',
    related: 'Əlaqəli baxışlar',
    sources: 'Mənbələr',
    faq: 'Tez-tez verilən suallar',
    ctaLine: 'Bu mövzunu öz sisteminizdə ələ almaq istəyirsiniz?',
    exploreService: 'Xidməti kəşf et',
    exploreProduct: 'Məhsulu kəşf et',
    ctaContact: 'Layihəyə başla',
    ctaCheckup: 'Pulsuz Rəqəmsal Check-Up',
    empty: 'Yeni baxışlar yoldadır. Bu arada necə işlədiyimizə baxın.',
    back: 'Bütün baxışlar',
    share: 'Paylaş',
  },
  services: {
    heading: 'Növbəti addımınız üçün lazım olan sistemi qururuq.',
    sub: 'Əvvəlcədən hazırlanmış paket satmaqla başlamırıq. Dəyişməli olan nöqtəni müəyyən edir və uyğun bacarıqları onun ətrafında birləşdiririk.',
    items: [
      { name: 'Brend Strategiyası və Kimlik', desc: 'Brendi aydın, uyğun və tanınan edən mövqeləndirmə, adlandırma, verbal kimlik və vizual sistemlər.', points: ['Mövqeləndirmə və brend arxitekturası', 'Adlandırma və verbal kimlik', 'Vizual kimlik sistemləri', 'Brend qaydaları və tətbiq'], changes: 'Brend adilikdən çıxır: hər yerdə vahid aydın mövqe, vahid səs, vahid kimlik.', problem: 'Brend kütlə içində itir: mövqeləndirmə aydın deyil, kimlik ardıcıl tətbiq olunmur və mesaj danışan şəxsə görə dəyişir.', stack: ['Figma', 'Frontify', 'Notion', 'Adobe Creative Cloud'] },
      { name: 'Veb və Rəqəmsal Təcrübələr', desc: 'Real istifadəçi davranışlarına əsaslanan korporativ saytlar, platformalar və konversiya yönümlü rəqəmsal təcrübələr.', points: ['UX arxitekturası və prototipləşdirmə', 'Korporativ və kampaniya saytları', 'E-ticarət təcrübələri', 'Performans, əlçatanlıq və SEO təməli'], changes: 'Sayt broşürdən ən yaxşı performans göstərən satıcınıza çevrilir.', problem: 'Ziyarətçi gəlir, amma yol aydın deyil: veb-sayt brendi izah edir, lakin insanı səmərəli şəkildə hərəkətə yönləndirmir və ölçülə bilən qurulmayıb.', stack: ['Next.js', 'Vercel', 'Figma', 'GA4', 'Google Tag Manager'] },
      { name: 'İnkişaf və Performans', desc: 'Vahid ölçülə bilən inkişaf modeli ilə birləşdirilən istifadəçi cəlbi, performans marketinqi, analitika və optimizasiya.', points: ['Google, Meta və TikTok kampaniyaları', 'Konversiya izləməsi və analitika qurulumu', 'SEO və məzmun strategiyası', 'CRO və açılış səhifəsi optimizasiyası'], changes: 'Marketinq xərci aylıq qumar deyil, ölçülən sistemə çevrilir.', problem: 'Kampaniyalar trafik gətirə bilər; amma cəlbetmə, konversiya və ölçmə ayrı yerlərdə yaşayır — artım oxunmur, optimallaşdırmaq daha da çətindir.', stack: ['Google Ads', 'Meta Ads', 'GA4', 'Meta CAPI', 'Semrush', 'Hotjar'] },
      { name: 'Kreativ İstehsal', desc: 'Diqqət qazanmaq üçün hazırlanan kampaniya ideyaları, sosial media məzmunu, reklam kreativləri və vizual sistemlər.', points: ['Kampaniya konseptləri', 'Sosial media məzmun sistemləri', 'Reklam kreativləri və motion', 'Art direksiya'], changes: 'Məzmun trend qovmağı dayandırır, tanınırlıq qurmağa başlayır.', problem: 'Kreativ istehsal ardıcıl deyil: formatlar tək-tək hazırlanır, kampaniyaların sistemi yoxdur və məzmun keyfiyyəti itirmədən miqyaslana bilmir.', stack: ['Adobe Creative Cloud', 'Figma', 'After Effects', 'Notion'] },
      { name: 'Süni İntellekt və Avtomatlaşdırma', desc: 'Təkrarlanan işləri azaldan, qərarları sürətləndirən və əməliyyatları yaxşılaşdıran praktik süni intellekt alətləri və avtomatlaşdırmalar.', points: ['İş axını avtomatlaşdırması', 'Sİ dəstəkli məzmun prosesləri', 'Söhbət və dəstək asistentləri', 'Daxili alətlər və inteqrasiyalar'], changes: 'Saatlarla çəkən təkrar işlər avtomatik, etibarlı axınlara enir.', problem: 'Təkrarlanan əl işi komandanı ləngidir: məlumat alətlər arasında əllə daşınır, qərarlar insan gözləyir və heç nə yoxlama addımı ilə avtomatlaşdırılmayıb.', stack: ['OpenAI API', 'Zapier / Make', 'Supabase', 'Cloudflare Workers'] },
      { name: 'Rəqəmsal Məhsul İnkişafı', desc: 'İdeyanın təsdiqindən MVP və buraxılışa qədər miqyaslana bilən faydalı rəqəmsal məhsullar hazırlayırıq.', points: ['İdeyanın təsdiqi və əhatə dairəsi', 'MVP dizaynı və inkişafı', 'Məhsul iterasiyası və analitika', 'Buraxılış və inkişaf dəstəyi'], changes: 'İdeyalar gözləməyi dayandırır: təsdiqlənir, qurulur və miqyaslana bilən şəkildə istifadəyə verilir.', problem: 'Yaxşı məhsul ideyaları ilişib qalır: MVP əhatəsi aydın deyil, məhsul-dizayn-tərtibat qərarları qopuqdur və imkan heç vaxt buraxılmış məhsula çevrilmir.', stack: ['Next.js', 'Supabase', 'Vercel', 'Figma', 'Cloudflare'] },
    ],
    explore: 'Bax',
  },
  servicesPage: {
    metaTitle: 'Xidmətlər — Strategiya, Dizayn, İnkişaf və Məhsul | Yoca',
    metaDescription: 'Yoca xidmətlərini kəşf edin: brend strategiyası, veb və rəqəmsal təcrübələr, inkişaf və performans, kreativ istehsal, Sİ avtomatlaşdırması və rəqəmsal məhsul inkişafı.',
    eyebrow: 'Xidmətlər',
    deliverables: 'Nələri əhatə edir',
    processTitle: 'Vahid proses. Qapalı qutu yoxdur.',
    processSub: 'Hər əməkdaşlıq eyni şəffaf ritmlə irəliləyir; işin hansı mərhələdə olduğunu və səbəbini hər zaman bilirsiniz.',
    process: [
      { name: 'Anla', desc: 'Bazarınızı, auditoriyanızı və mövcud quruluşunuzu xəritələyirik — qərarlar fərziyyədən deyil, faktlardan başlayır.' },
      { name: 'Müəyyən et', desc: 'Ən vacib dəyişikliyi və ona gedən ən aydın yolu birlikdə müəyyən edirik.' },
      { name: 'Qur', desc: 'Strategiya, dizayn və proqramlaşdırma qısa, izlənə bilən dövrlərlə yan-yana işləyir.' },
      { name: 'İstifadəyə ver', desc: 'Heç nə təsadüfən yayımlanmır: ilkin baxış, məzmun yoxlamaları və təmiz produksiya buraxılışı.' },
      { name: 'Böyüt', desc: 'Ölçürük, şəffaf hesabat veririk və datanın işlədiyini sübut etdiyi nöqtələri optimallaşdırmağa davam edirik.' },
    ],
    tabs: { problem: 'Hansı problemi həll edir?', deliverables: 'Nələr təhvil verilir?', stack: 'Texnologiya dəsti', changes: 'Nə dəyişir?' },
    stackNote: 'Alətlər problemə görə seçilir — heç vaxt əksinə yox.',
    flowTitle: 'Bu necə reallaşır.',
    flows: [['Mövqe', 'Dil', 'Kimlik', 'Təcrübə'], ['Strategiya', 'UX', 'İnterfeys', 'Tərtibat', 'Ölçmə'], ['Cəlb et', 'Çevir', 'Ölç', 'Optimallaşdır'], ['İdeya', 'Sistem', 'İstehsal', 'Uyğunlaşdır', 'Yayımla'], ['Tətik', 'Proses', 'İntellekt', 'Baxış', 'Hərəkət'], ['Problem', 'Axın', 'Prototip', 'Tərtibat', 'İterasiya']],
    groups: [
      {
        key: 'brand',
        system: 'Yoca Brand System™',
        title: 'Brend və Kreativ',
        desc: 'Brend strategiyası, kimlik və kreativ istehsal — brendi aydın, mənalı və qarışdırıla bilməz edən vahid sistemdə birləşir.',
        problem: 'Brend görünmür və ya adiləşib: qeyri-müəyyən mövqeləndirmə, ziddiyyətli kimlik və diqqət qazana bilməyən kreativ işlər.',
        deliverables: ['Mövqeləndirmə və brend arxitekturası', 'Adlandırma və verbal kimlik', 'Vizual kimlik sistemləri', 'Kampaniya konseptləri və art direksiya', 'Sosial media məzmun sistemləri', 'Reklam kreativləri və motion'],
        stack: ['Figma', 'Adobe Creative Cloud', 'Notion', 'Frontify'],
        changes: 'Daha aydın bazar mövqeyi, daha tanınan kimlik və ardıcıl kreativ təməl.',
      },
      {
        key: 'growth',
        system: 'Yoca Growth Engine™',
        title: 'İnkişaf və Rəqəmsal Təcrübə',
        desc: 'Konversiya yönümlü rəqəmsal təcrübələr və performans marketinqi vahid ölçülə bilən inkişaf mühərrikində birləşir.',
        problem: 'Konversiyasız trafik, izlənməyən reklamlar — yaxşı görünən, amma satmayan sayt və həqiqəti deyən heç bir göstərici yoxdur.',
        deliverables: ['UX arxitekturası və konversiya yönümlü saytlar', 'E-ticarət təcrübələri', 'Google / Meta / TikTok kampaniyaları', 'İzləmə, analitika və atribusiya', 'SEO və məzmun strategiyası', 'CRO və açılış səhifəsi optimizasiyası'],
        stack: ['Next.js', 'GA4', 'Google Tag Manager', 'Meta CAPI', 'Semrush', 'Hotjar'],
        changes: 'Diqqətdən hərəkətə daha ölçülə bilən yol; daha aydın istifadəçi yolları və daha güclü optimizasiya siqnalları.',
      },
      {
        key: 'scale',
        system: 'Yoca Scale Framework™',
        title: 'Məhsul və Avtomatlaşdırma',
        desc: 'Sİ avtomatlaşdırması və rəqəmsal məhsul inkişafı — biznes mürəkkəbliyi artmadan böyüsün deyə.',
        problem: 'Əməliyyatlar təkrarda boğulur, yaxşı ideyalar heç vaxt işə düşmür: MVP intizamı yox, avtomatlaşdırma yox, məhsul ekosistemi yox.',
        deliverables: ['İş axını avtomatlaşdırması', 'Sİ dəstəkli məzmun prosesləri', 'Söhbət və dəstək asistentləri', 'İdeyanın təsdiqi və MVP inkişafı', 'Məhsul iterasiyası və analitika', 'Buraxılış və inkişaf dəstəyi'],
        stack: ['Supabase', 'Vercel', 'OpenAI API', 'Zapier / Make', 'Cloudflare'],
        changes: 'Daha az təkrarlanan iş və daha güclü rəqəmsal məhsul təməli ilə daha miqyaslana bilən idarəetmə modeli.',
      },
    ],
  },
  products: {
    metaTitle: 'Məhsullar — YocaServe, WonKick, YocaStudio, Demo Hub və Labs | Yoca',
    metaDescription: 'Yoca-nın öz məhsul ekosistemi: YocaServe, WonKick, YocaStudio, Yoca Demo Hub və Yoca Labs — müştəri brendlərinə tətbiq etdiyimiz sistemlərlə qurulur və böyüdülür.',
    eyebrow: 'Yoca Məhsulları',
    heading: 'Özümüz qurub böyütdüyümüz məhsullar.',
    sub: 'Məhsul ekosistemimiz Yoca metodologiyasının praktikada sınandığı yerdir — müştəri işlərinə gətirdiyimiz strateji, kreativ və texniki sistemlərin öz qurduğumuz məhsullara tətbiqi.',
    statusLive: 'Aktiv',
    statusSoon: 'Hazırlanır',
    statusExp: 'Eksperimental',
    liveDemo: 'Canlı Demo',
    overviewCta: 'Məhsul Xülasəsinə Bax',
    enquireCta: 'Bu məhsul haqqında məlumat al',
    enquirePrefill: '{product} haqqında məlumat almaq istəyirəm.',
    items: [
      {
        key: 'yocaserve',
        name: 'YocaServe',
        category: 'Qonaqpərvərlik Texnologiyası',
        desc: 'Restoranlar, kafelər, otellər və qonaqpərvərlik biznesləri üçün hazırlanmış sürətli və çevik QR menyu və rəqəmsal xidmət sistemi.',
        status: 'live',
        cta: 'YocaServe-ə Bax',
        capabilities: ['Çoxdilli', 'QR Sifariş', 'Paylaşımlı Hostinqə Uyğun'],
      },
      {
        key: 'wonkick',
        name: 'WonKick',
        category: 'Futbol / İnteraktiv',
        desc: 'Futbol azarkeşlərinin heyət qurduğu, gündəlik futbol tapşırıqlarını həll etdiyi və interaktiv oyun rejimlərində yarışdığı futbol arcade mərkəzi.',
        status: 'soon',
        cta: 'WonKick-i Kəşf Et',
        capabilities: ['Gündəlik Tapşırıqlar', 'Heyət Qurucusu', 'İnteraktiv Oyun Rejimləri'],
      },
      {
        key: 'yocastudio',
        name: 'YocaStudio',
        category: 'Mobil Oyun Studiyası',
        desc: 'Mobil cihazlar üçün orijinal, əlçatan və təkrar oynanıla bilən oyun təcrübələri hazırlayan, Yoca daxilindəki müstəqil oyun studiyası.',
        status: 'soon',
        cta: 'YocaStudio-nu kəşf et',
        capabilities: ['Mobil-öncəlikli', 'Orijinal IP', 'Sürətli prototipləmə'],
      },
      {
        key: 'demo-hub',
        name: 'Yoca Demo Hub',
        category: 'Demo Platforması',
        desc: 'Yoca tərəfindən dizayn və inkişaf etdirilən rəqəmsal konseptlərin, saytların və təcrübələrin çoxdilli vitrini.',
        status: 'live',
        cta: 'Demo Hub-a Bax',
        capabilities: ['Çoxdilli', 'Canlı Demolar', 'Modulyar Vitrin'],
      },
      {
        key: 'labs',
        name: 'Yoca Labs',
        category: 'Kreativ Texnologiya',
        desc: 'Vizual süni intellekt, kreativ texnologiya və yeni nəsil rəqəmsal təcrübələr üçün Yoca-nın eksperimental inkişaf sahəsi.',
        status: 'exp',
        cta: 'Yoca Labs-ı Kəşf Et',
        capabilities: ['Sİ Dəstəkli', 'Vizual Eksperimentlər', 'Sürətli Prototipləşdirmə'],
      },
    ],
  },
  about: {
    metaTitle: 'Haqqımızda — Yoca | Your Own Creative Agency',
    metaDescription: 'Yoca strategiya, dizayn, texnologiya və performansı vahid sistemdə birləşdirən müstəqil kreativ inkişaf tərəfdaşıdır. Yanaşma, dəyərlər və komanda ilə tanış olun.',
    eyebrow: 'Haqqımızda',
    heading: 'Komandanız kimi düşünəcək qədər yaxın. Ona meydan oxuyacaq qədər müstəqil.',
    sub: 'Your Own Creative Agency.',
    storyTitle: 'Niyə varıq',
    story1: 'Əksər brendlər ideya çatışmazlığından uğursuz olmur. Strategiya, dizayn, texnologiya və marketinqin ayrı otaqlarda, ayrı podratçılarla, ayrı göstəricilərlə yaşamasından uğursuz olur.',
    story2: 'Yoca bu boşluğu bağlamaq üçün quruldu. Yığcam və təcrübəli vahid komanda kimi tək sualın ətrafında işləyirik: bu brendin böyüməsi üçün əslində nə dəyişməlidir və bunu qurmağın ən aydın yolu nədir?',
    story3: 'Adımızın Your Own Creative Agency olmasının səbəbi də budur: kənar podratçı kimi deyil, daxili komandaya daha yaxın şəkildə — inteqrasiyalı, şəffaf və hesabatlı işləyirik.',
    valuesTitle: 'İş prinsiplərimiz',
    valuesSub: 'Divar posteri deyil — hər layihədə gündəlik qərarları formalaşdıran real qaydalar.',
    values: [
      { title: 'Fərziyyədən Əvvəl Sübut', body: 'İşə araşdırma, davranış və performans datası istiqamət verir. Sübutu mühakimənin əvəzinə deyil, fərziyyələrə meydan oxumaq üçün istifadə edirik.' },
      { title: 'Fəaliyyətdən Əvvəl Nəticə', body: 'Daha çox fəaliyyət avtomatik olaraq daha çox dəyər yaratmır. İşin yaratmalı olduğu mənalı dəyişikliyə fokuslanırıq.' },
      { title: 'Qara Qutusuz Aydınlıq', body: 'Hər vacib qərarın arxasındakı düşüncəni, prioritetləri və sübutu görürsünüz.' },
      { title: 'Məqsədli Ustalıq', body: 'Hər vizual və texniki qərar öz yerini aydınlıq, faydalılıq və ya performansla qazanmalıdır.' },
    ],
    manifesto: ['Aydın düşün.', 'Şüurlu qur.', 'Dürüst ölç.', 'Daim təkmilləşdir.'],
    stackTitle: 'Alətlər dəyişir. Sistem bağlı qalır.',
    stackSub: 'Platform tərkibi layihədən layihəyə dəyişə bilər. Dəyişməyən isə strategiya, icra və ölçmənin bir-birinə bağlanma tərzidir.',
    builtTitle: 'Necə qurulmuşuq',
    builtLines: ['Kompakt komanda.', 'Təcrübəli düşüncə.', 'Tək cavabdeh sistem.', 'Problemin ətrafında qurulub.'],
  },
  work: {
    metaTitle: 'Seçilmiş Layihələr — Brendlər və Rəqəmsal Təcrübələr | Yoca',
    metaDescription: 'Yoca tərəfindən müxtəlif sektorlar və bazarlar üçün hazırlanmış seçilmiş brendlər, saytlar, platformalar və rəqəmsal təcrübələr.',
    eyebrow: 'Seçilmiş Layihələr',
    heading: 'Fərqli ehtiyaclar. Aydın qərarlar. Hərəkət yaradan işlər.',
    sub: 'YOCA-nın müştəriləri üçün dizayn edib qurduğu veb-saytlar və rəqəmsal təcrübələr.',
    sector: 'Sektor',
    market: 'Bazar',
    year: 'İl',
    servicesLabel: 'Xidmətlər',
    problem: 'Ehtiyac',
    approach: 'Yoca-nın işi',
    solution: 'Təhvil verilənlər',
    result: 'Təsdiqlənmiş Nəticələr',
    viewCase: 'Layihəyə Bax',
    backToWork: 'Layihələrə Qayıt',
    allWork: 'Bütün Layihələrə Bax',
    filterAll: 'Hamısı',
    filterClients: 'Müştəri Layihələri',
    filterConcepts: 'Konsept Layihələr',
    filterProducts: 'Yoca Təşəbbüsləri və Məhsulları',
    metricNote: '* Göstəricilər yalnız təsdiqlənmiş və müştəri tərəfindən razılaşdırılmış nəticələri əks etdirir.',
    quoteLabel: 'Müştəri Rəyi',
    resultPeriod: 'Dövr',
    resultBaseline: 'Müqayisə',
    resultBasis: 'Mənbə',
    empty: 'Bu kateqoriyada hələ layihə yoxdur.',
    statusClient: 'Müştəri Layihəsi',
    statusConcept: 'Konsept Layihə',
    statusProduct: 'Yoca Məhsulu',
    statusVenture: 'Yoca Təşəbbüsü',
    statusExp: 'Eksperimental',
    designedOutcome: 'Nəzərdə tutulan təsir',
    screensLabel: 'Seçilmiş ekranlar',
    conceptNote: 'Yoca tərəfindən dizayn edilmiş və hazırlanmış konsept layihə.',
    liveLabel: 'Canlı Bax',
  },
  contact: {
    metaTitle: 'Yoca ilə Əlaqə — Layihənizə Başlayın',
    metaDescription: 'Nə qurduğunuzu bizə danışın. Layihənizi, mərhələsini və dəyişmək istədiklərinizi paylaşın; doğru növbəti addımı birlikdə müəyyən edək.',
    eyebrow: 'Əlaqə',
    heading: 'Növbəti addımı birlikdə quraq.',
    description: 'Üzərində işlədiyiniz layihəni, hazırda hansı mərhələdə olduğunu və nəyi dəyişmək istədiyinizi paylaşın. Aydın məlumat daha yaxşı söhbətə başlamağa kömək edir.',
    name: 'Ad və Soyad',
    email: 'E-poçt Ünvanı',
    company: 'Şirkət və ya Brend',
    message: 'Layihəniz Haqqında Danışın',
    submit: 'Layihə Brifini Göndər',
    success: 'Mesajınız çatdı. Paylaşdığınız məlumatları nəzərdən keçirib sizə e-poçtla cavab verəcəyik.',
    based: 'Türkiyə mərkəzli. Müxtəlif bazarlarda işləyirik.',
    addressLabel: 'Ünvan',
    direct: 'E-poçtu üstün tutursunuz?',
    website: 'Saytınız və ya mövcud rəqəmsal varlığınız',
    plannerSystems: 'Hansı sistemlərə ehtiyacınız var?',
    plannerBudget: 'Təxmini büdcə',
    systems: ['Yoca Brand System™', 'Yoca Growth Engine™', 'Yoca Scale Framework™', 'Rəqəmsal Məhsul', 'Hələ Əmin Deyiləm'],
    budgets: ['5.000 $-dan az', '5.000 – 15.000 $', '15.000 – 40.000 $', '40.000 $+', 'Hələ müəyyən deyil'],
    phone: 'Telefon (istəyə bağlı)',
    launchLabel: 'Hədəf başlama dövrü',
    launches: ['Ən qısa zamanda', '1–3 ay ərzində', '3–6 ay ərzində', 'Hələlik araşdırıram'],
    nextTitle: 'Bəs sonra?',
    nextSteps: ['Brifinizi nəzərdən keçiririk.', 'Doğru başlanğıc nöqtəsini müəyyən edirik.', 'Növbəti addım üçün sizinlə əlaqə saxlayırıq.'],
    scheduleTitle: 'Danışaraq irəliləmək istəyirsiniz?',
    scheduleSub: 'Pulsuz 30 dəqiqəlik tanışlıq zəngi planlaşdırın; doğru növbəti addımı birlikdə müəyyən edək.',
    calendlyUrl: '',
  },
  legal: {
    formNoticeBefore: 'Bu formda paylaşdığınız şəxsi məlumatların emalı ilə bağlı məlumatı ',
    formNoticeLink: 'Məlumatlandırma bildirişində',
    formNoticeAfter: ' tapa bilərsiniz.',
    noticeTitle: 'Məlumatlandırma bildirişi',
  },
  cookies: {
    text: 'Saytın işləməsi üçün zəruri kukilərdən, istifadəsini anlamaq üçün isə seçimli analitika kukilərindən istifadə edirik.',
    acceptAll: 'Hamısını Qəbul Et',
    essentialOnly: 'Yalnız Zəruri',
  },
  notFound: {
    heading: 'Bu səhifə arxasında strategiya qoymadan köçüb.',
    text: 'Axtardığınız səhifə mövcud deyil və ya başqa ünvana köçürülüb.',
    back: 'Ana Səhifəyə Qayıt',
  },
  errorPage: {
    heading: 'Bizim tərəfdə problem yarandı.',
    text: 'Gözlənilməz xəta baş verdi. Bir az sonra yenidən cəhd edin.',
    retry: 'Yenidən Cəhd Et',
  },
  common: {
    languageSwitcher: 'Dil',
    loading: 'Yüklənir…',
  },
  hero: {
    eyebrow: 'Müstəqil Kreativ İnkişaf Tərəfdaşı',
    title: 'Brendinizi dizayn edir, rəqəmsalda həyata keçiririk.',
    description:
      'Brend kimliyi, veb-sayt, rəqəmsal məhsul və marketinq işlərini layihənizin ehtiyacına uyğun olaraq bir araya gətiririk.',
    emphasis: ['rəqəmsalda'],
    primaryCta: 'Layihəyə Başla',
    secondaryCta: 'Pulsuz Rəqəmsal Check-Up',
    line: 'Strategiya. Kimlik. Təcrübə. İnkişaf.',
  },
  systems: {
    heading: 'Vahid metodologiya. Bir-birinə bağlı üç sistem.',
    sub: 'Hər əməkdaşlıq eyni ardıcıllıqla irəliləyir — əvvəl brend, sonra inkişaf, sonra miqyas — beləcə hər mərhələ növbətini gücləndirir.',
    items: [
      {
        name: 'Yoca Brand System™',
        tagline: 'Mövqeləndirmə və kimlik',
        body: 'Brendin bazarda mənalı mövqe qazanmasını təmin edən mövqeləndirmə, mesaj, kimlik və təcrübə.',
        points: ['Mövqeləndirmə və arxitektura', 'Verbal və vizual kimlik', 'Təcrübə prinsipləri'],
      },
      {
        name: 'Yoca Growth Engine™',
        tagline: 'Ölçülə bilən impuls',
        body: 'Kommunikasiya, kampaniya, performans və konversiyanın təkrarlana bilən vahid inkişaf sistemində birləşməsi.',
        points: ['Performans kampaniyaları', 'Konversiya və analitika', 'Məzmun və SEO'],
      },
      {
        name: 'Yoca Scale Framework™',
        tagline: 'Birləşərək böyüyən quruluş',
        body: 'Lazımsız mürəkkəblik olmadan böyümək üçün tələb olunan infrastruktur, proseslər və məhsul ekosistemi.',
        points: ['Avtomatlaşdırma və Sİ', 'Məhsul ekosistemi', 'Əməliyyat alətləri'],
      },
    ],
  },
  clients: { heading: 'Yoca imzası ilə.', sub: 'Yoca sistemi ilə hazırlanmış seçilmiş konseptlər, rəqəmsal təcrübələr və məhsullar.' },
  partners: {
    heading: 'Alətlər dəyişir. Sistem bağlı qalır.',
    sub: 'Hər layihə üçün doğru platformaları seçir, sonra onları vahid aydın ölçmə və idarəetmə modeli ilə birləşdiririk.',
    categories: [
      { name: 'Ölç', tools: ['Google Analytics 4', 'Google Tag Manager', 'Search Console', 'Hotjar'] },
      { name: 'Böyüt', tools: ['Google Ads', 'Meta Ads', 'TikTok Ads', 'Semrush'] },
      { name: 'Qur', tools: ['Next.js', 'Vercel', 'Supabase', 'Cloudflare'] },
    ],
  },
  clocks: { heading: 'Müxtəlif bazarlar və saat qurşaqlarında işləyirik.', sub: 'Türkiyə mərkəzli; Avropa, Qafqaz, MENA və daha geniş coğrafiyadakı layihələrə bağlıyıq.', active: 'İşlədiyimiz regionlarda cari yerli vaxtlar.', istanbul: 'İstanbul', baku: 'Bakı', london: 'London', dubai: 'Dubay' },
  team: {
    heading: 'Sistemin arxasındakı insanlar.',
    sub: 'Mərhələsiz işləyən yığcam təcrübəli komanda — strategiya, kreativ, proqramlaşdırma və inkişaf yan-yana.',
    linkedin: 'LinkedIn profili:',
  },
  cta: {
    heading: 'Növbəti olaraq nə qurursunuz?',
    body: 'Hazırda harada olduğunuzu, hara çatmaq istədiyinizi və qarşınızda nə dayandığını paylaşın. Doğru növbəti addımı birlikdə müəyyən edək.',
    button: 'Söhbətə Başla',
  },
  home: {
    ctaWork: 'Layihələrə baxın',
    ctaBrief: 'Layihənizi bizə danışın',
    reelLabel: 'Seçilmiş iş',
    workEyebrow: 'Seçilmiş layihələr',
    workTitle: 'Dizayn edib hazırladığımız işlərdən seçmələr.',
    workAll: 'Bütün layihələr',
    servicesTitle: 'Nə edirik',
    relatedWork: 'Bu sahədəki işimiz',
    serviceLink: 'Xidmətə baxın',
    processEyebrow: 'Proses',
    processTitle: 'Hər layihə eyni açıq ritmlə irəliləyir.',
    processSub: 'Hansı mərhələdə olduğumuzu və növbəti addımı hər zaman birlikdə görürük.',
    process: [
      { name: 'Anlamaq', desc: 'Brendinizi, auditoriyanızı və bugünkü vəziyyəti birlikdə öyrənir, nəyin dəyişməli olduğunu aydınlaşdırırıq.' },
      { name: 'Dizayn', desc: 'Kimlik, məzmun və interfeys qərarlarını nəzərdən keçirə biləcəyiniz eskizlərlə formalaşdırırıq.' },
      { name: 'İnkişaf', desc: 'Təsdiqlənmiş dizaynı sürətli, əlçatan və komandanızın idarə edə biləcəyi struktura çeviririk.' },
      { name: 'Yayım', desc: 'Önizləmə yoxlaması və məzmun nəzarətindən sonra işi səliqəli şəkildə yayıma veririk.' },
      { name: 'Təkmilləşdirmə', desc: 'Yayımdan sonra ölçür, öyrənir və lazım olan nöqtələri birlikdə inkişaf etdiririk.' },
    ],
    checkupHow: 'Necə işləyir?',
    checkupSteps: [
      { title: 'Sualları cavablayın', desc: 'Brendiniz, veb-saytınız, kanallarınız və hədəfləriniz haqqında {n} qısa sual.' },
      { title: 'Cavablarınızı nəzərdən keçiririk', desc: 'Cavablarınızı komandamız oxuyur.' },
      { title: 'Prioritetlərinizi görün', desc: 'Prioritetləşdirilmiş qiymətləndirməni və aydın növbəti addımları e-poçtunuza göndəririk.' },
    ],
    checkupLooks: 'Baxdığımız sahələr',
    insightsTitle: 'Baxışlardan son yazılar',
    closingChannels: 'Birbaşa əlaqə',
    channelEmail: 'E-poçt',
    channelForm: 'Əlaqə forması',
  },
  caseView: {
    nextProject: 'Növbəti layihə',
    desktop: 'Masaüstü',
    mobile: 'Mobil',
    inUse: 'İstifadədə',
    visitSite: 'Sayta keçin',
  },
  footer: {
    message: 'Yaxşı ideyalar onları irəli aparacaq düzgün sistemə layiqdir.',
    rights: 'Yoca. Your Own Creative Agency. Bütün hüquqlar qorunur.',
    company: 'Şirkət',
    connect: 'Əlaqə',
    hook: 'Növbəti dəfə birlikdə nə quraq?',
    hookCta: 'Layihəyə Başla',
    colSystems: 'Sistemlər',
    colProducts: 'Məhsullar',
    exploreProducts: 'Yoca Məhsullarını Kəşf Et',
    gatewayProject: 'Növbəti addımını müəyyən edib qurmağa hazır brendlər üçün.',
    gatewayCheckup: 'Əvvəlcə nəyi yaxşılaşdıracağına daha aydın baxışa ehtiyacı olan bizneslər üçün.',
    gatewayProducts: 'Yoca daxilində qurduğumuz, sınadığımız və böyütdüyümüz rəqəmsal məhsulları görün.',
  },
  checkup: {
    eyebrow: 'Rəqəmsal Check-Up',
    title: 'Rəqəmsal varlığınız nə qədər sağlamdır?',
    description:
      'Brendiniz, kanallarınız və hədəfləriniz haqqında bir neçə qısa suala cavab verin. Cavablarınızı nəzərdən keçirib aydın addımlar içərən fərdi rəqəmsal analiz hazırlayaq.',
    introTitle: 'Brendinizin rəqəmsal vəziyyətini birlikdə qiymətləndirək.',
    sampleTitle: 'Rəqəmsal sağlamlıq',
    sampleLabel: 'Nümunə nəticə',
    sampleNote: 'Nümayiş üçün nümunə dəyərlər — real hesabatınız öz cavablarınız əsasında hazırlanır.',
    introSub:
      'Brendiniz, saytınız, kanallarınız, ölçmə quruluşunuz və inkişaf hazırlığınız haqqında 16 fokuslu suala cavab verin. Cavablarınızı nəzərdən keçirir, prioritetləşdirilmiş qiymətləndirmə və aydın növbəti addımlar göndəririk.',
    introStart: 'Check-Up-ımı Başlat',
    introPoints: ['Cavablamaq təxminən 3 dəqiqə', '16 fokuslu sual', 'Avtomatik deyil, bir insan baxır', 'Aydın növbəti addımlar'],
    sectionWord: 'Bölmə',
    sections: [
      { key: 'business', label: 'Biznes' },
      { key: 'website', label: 'Veb sayt' },
      { key: 'marketing', label: 'Marketinq' },
      { key: 'brand', label: 'Brend' },
      { key: 'measurement', label: 'Ölçmə' },
      { key: 'goals', label: 'Hədəflər' },
    ],
    step: 'Addım',
    of: '/',
    next: 'İrəli',
    back: 'Geri',
    submit: 'Analizimi Göndər',
    contactTitle: 'Demək olar bitdi. Analizinizi hara göndərək?',
    contactDesc: 'Hər check-up müraciətini ayrıca nəzərdən keçirir və qısa, səmimi qiymətləndirmə ilə cavab veririk.',
    name: 'Ad və Soyad',
    company: 'Şirkət və ya Brend',
    email: 'E-poçt Ünvanı',
    phone: 'Telefon Nömrəsi',
    success: 'Cavablarınız çatdı. Qiymətləndirmənizi hazırlayıb e-poçt ünvanınıza göndərəcəyik.',
    errorRequired: 'Zəhmət olmasa, vacib xanaları doldurun.',
    errorEmail: 'Zəhmət olmasa, düzgün e-poçt ünvanı daxil edin.',
    errorGeneric: 'Xəta baş verdi. Yenidən cəhd edin və ya birbaşa e-poçt göndərin.',
    questions: [
      { key: 'sector', title: 'Hansı sektordasınız?', options: ['E-ticarət / Pərakəndə', 'Peşəkar Xidmətlər', 'Qonaqpərvərlik / Turizm', 'Səhiyyə', 'Texnologiya / SaaS', 'Daşınmaz Əmlak / Tikinti', 'Digər'] },
      { key: 'audience', title: 'Kimə satış edirsiniz?', options: ['Bizneslərə (B2B)', 'İstehlakçılara (B2C)', 'Hər ikisi'] },
      { key: 'size', title: 'Komandanız nə qədər böyükdür?', options: ['Yalnız mən', '2–10 nəfər', '11–50 nəfər', '50+ nəfər'] },
      { key: 'website', title: 'Saytınızı necə təsvir edərdiniz?', options: ['Saytımız yoxdur', 'Köhnədir — fəxr etmirik', 'Yenidir, amma nəticə vermir', 'Müasirdir və yaxşı işləyir'] },
      { key: 'mobile', title: 'Saytınız telefonda rahat istifadə olunur?', options: ['Xeyr / əmin deyiləm', 'Qismən', 'Bəli, tam mobil uyğundur'] },
      { key: 'ecommerce', title: 'Onlayn satış edirsiniz?', options: ['Onlayn satış yoxdur', 'Yalnız marketpleyslərdə', 'Öz onlayn mağazamız var', 'Öz mağaza + marketpleyslər'] },
      { key: 'seo', title: 'SEO vəziyyətiniz necədir?', options: ['Heç işlənməyib', 'Sınadıq, sonra dayandırdıq', 'Davam edir, amma məhduddur', 'Güclü orqanik trafikimiz var'] },
      { key: 'content', title: 'Nə qədər tez-tez məzmun paylaşırsınız?', options: ['Nadir hallarda / heç', 'Bəzən', 'Planlı və müntəzəm'] },
      { key: 'google_ads', title: 'Google Ads reklamı verirsiniz?', options: ['Xeyr', 'Keçmişdə vermişik', 'Bəli, özümüz idarə edirik', 'Bəli, peşəkar idarəetmə ilə'] },
      { key: 'meta_ads', title: 'Meta (Instagram / Facebook) reklamı verirsiniz?', options: ['Xeyr', 'Keçmişdə vermişik', 'Bəli, özümüz idarə edirik', 'Bəli, peşəkar idarəetmə ilə'] },
      { key: 'other_channels', title: 'Başqa aktiv kanalınız var?', options: ['Yoxdur', 'TikTok', 'LinkedIn', 'YouTube', 'Bir neçəsi'] },
      { key: 'social', title: 'Sosial medianız nə qədər aktivdir?', options: ['Aktiv deyil', 'Nizamsız paylaşım', 'Müntəzəm paylaşım', 'Güclü və aktiv icma'] },
      { key: 'analytics', title: 'Nəticələrinizi necə ölçürsünüz?', options: ['Ölçmürük', 'Analytics qurulub, amma istifadə olunmur', 'Hesabatları müntəzəm izləyirik', 'Konversiya izləməsi ilə tam ölçüm'] },
      { key: 'crm', title: 'Müştəri sorğularını necə izləyirsiniz?', options: ['İzləmirik', 'Excel / qeydlər', 'Sadə CRM aləti', 'Avtomatlaşdırılmış inteqrasiyalı CRM'] },
      { key: 'budget', title: 'Aylıq marketinq büdcəniz nə qədərdir?', options: ['Sabit büdcə yoxdur', '1.000 $-dan az', '1.000 – 5.000 $', '5.000 $+'] },
      { key: 'goal', title: 'Əsas inkişaf hədəfiniz nədir?', options: ['Brend tanınırlığı', 'Daha çox müştəri sorğusu', 'Onlayn satış artımı', 'Yeni bazar və ya məhsul buraxılışı', 'Mövcud strukturdan daha çox səmərə'] },
    ],
  },
};

const ar: Dict = {
  meta: {
    homeTitle: 'Yoca — شريك النمو الإبداعي',
    homeDescription:
      'تبني Yoca العلامات والتجارب الرقمية وأنظمة النمو والمنتجات الرقمية عبر الاستراتيجية والتصميم والتقنية والأداء.',
    checkupTitle: 'فحص رقمي مجاني — قِس صحتك الرقمية | Yoca',
    checkupDescription:
      'أجب عن مجموعة قصيرة من الأسئلة واحصل على تحليل شخصي لحضورك الرقمي: الموقع، SEO، الإعلانات، وسائل التواصل وبنية النمو.',
  },
  nav: { home: 'الرئيسية', about: 'من نحن', services: 'الخدمات', work: 'الأعمال', products: 'المنتجات', checkup: 'الفحص الرقمي', contact: 'تواصل معنا', insights: 'رؤى' },
  overview: {
    metaTitle: 'تعرّف على Yoca — لمحة عن الشركة في 90 ثانية',
    metaDescription: 'من هي Yoca، لماذا وُجدت، ماذا تفعل، كيف تعمل، ماذا تبني وأين تعمل — في نحو تسعين ثانية.',
    title: 'تعرّف على Yoca',
    identity: 'Your Own Creative Agency',
    cover: 'من الأفكار إلى علامات. ومن العلامات إلى أنظمة تنمو.',
    coverLines: ['من الفكرة إلى علامة.', 'ومن العلامة إلى نظام ينمو.'],
    menuLabel: 'القائمة',
    sceneOf: 'المشهد {n} من {total}',
    systems: [
      { short: 'العلامة', descriptor: 'التموضع والهوية', steps: ['الموقع', 'اللغة', 'الهوية', 'التجربة'] },
      { short: 'النمو', descriptor: 'نمو قابل للقياس', steps: ['الانتباه', 'التحويل', 'القياس', 'التحسين'] },
      { short: 'التوسّع', descriptor: 'أنظمة قابلة للتوسّع', steps: ['الأتمتة', 'المنتج', 'البنية التحتية', 'التوسّع'] },
    ],
    whoHeading: 'كيف يتكوّن فريقنا؟',
    cue: 'اكتشف Yoca',
    menu: ['المقدمة', 'Yoca', 'لماذا', 'الأنظمة', 'الخدمات', 'المنهج', 'الأعمال', 'المنتجات', 'من نحن', 'عالميًا', 'تواصل'],
    backToSite: 'العودة إلى الموقع الكامل',
    scene: 'مشهد',
    whatHeading: 'ليست وكالة. بل نظام نمو مترابط.',
    whatSub: 'الاستراتيجية والهوية والتجربة والتقنية والنمو — تُصمَّم وتُدار كنظام واحد.',
    whatWords: ['الاستراتيجية', 'الهوية', 'التجربة', 'التقنية', 'النمو'],
    whyLines: ['قد تكون علامتك جيدة.', 'قد يكون موقعك جيدًا.', 'قد تعمل إعلاناتك.', 'قد تكون تقنيتك قوية.'],
    whyConclusion: 'لكن إن لم تكن مترابطة، فهي ليست نظام نمو.',
    systemsCaption: 'منهجية واحدة. ثلاثة أنظمة مترابطة.',
    servicesCta: 'اكتشف كل الخدمات',
    processHeading: 'كيف نعمل',
    processLines: ['السياق قبل الافتراض.', 'اتجاه واحد واضح.', 'تتحوّل الاستراتيجية إلى واقع.', 'أطلق. قِس. تعلّم.', 'طوّر ما ينجح.'],
    workLabel: 'أعمال مختارة',
    workCta: 'اطّلع على الأعمال المختارة',
    productsOpen: 'نبني للعملاء.',
    productsReveal: 'ونبني لأنفسنا أيضًا.',
    productsCta: 'اكتشف المنتجات',
    whoLines: ['فريق صغير ومركّز.', 'خبرة عميقة.', 'مبنيّ حول المشكلة.'],
    whoTraits: ['مستقلّون', 'متعدّدو التخصّصات', 'مسؤولون'],
    whoFormula: 'استراتيجية + إبداع + تقنية + نمو',
    globalLine: 'مقرّنا تركيا. ونعمل عبر الحدود.',
    finalSmall: 'إذن، ما الذي نبنيه تاليًا؟',
    finalLarge: 'لنبنِ ما هو قادم، معًا.',
    pathProject: 'ابدأ مشروعًا',
    pathCheckup: 'لست متأكدًا من أين تبدأ؟',
    pathCheckupSub: 'فحص رقمي مجاني',
    pathSite: 'اكتشف الموقع الكامل',
  },
  insights: {
    metaTitle: 'رؤى — الفكر وراء العمل | Yoca',
    metaDescription: 'وجهات نظر من Yoca حول الاستراتيجية والعلامة التجارية والتجارب الرقمية والنمو والذكاء الاصطناعي والمنتجات — الفكر وراء الأنظمة التي نبنيها.',
    eyebrow: 'رؤى Yoca',
    heading: 'الفكر وراء العمل.',
    sub: 'وجهات نظر حول الاستراتيجية والعلامة والتجارب الرقمية والنمو والذكاء الاصطناعي والمنتجات — مكتوبة من داخل الأنظمة التي نبنيها.',
    featured: 'مميّز',
    latest: 'أحدث الرؤى',
    all: 'الكل',
    minRead: 'دقائق قراءة',
    by: 'بقلم',
    related: 'رؤى ذات صلة',
    sources: 'المصادر',
    faq: 'أسئلة شائعة',
    ctaLine: 'هل تودّ معالجة هذا الموضوع في نظامك الخاص؟',
    exploreService: 'اكتشف الخدمة',
    exploreProduct: 'اكتشف المنتج',
    ctaContact: 'ابدأ مشروعًا',
    ctaCheckup: 'فحص رقمي مجاني',
    empty: 'رؤى جديدة في الطريق. في هذه الأثناء، اطّلع على طريقة عملنا.',
    back: 'كل الرؤى',
    share: 'مشاركة',
  },
  services: {
    heading: 'نبني البنية التي تحتاجها خطوتك التالية.',
    sub: 'لا نبدأ ببيع حزمة جاهزة. نحدد ما يجب أن يتغير، ثم نجمع القدرات المناسبة حوله.',
    items: [
      { name: 'استراتيجية العلامة والهوية', desc: 'تموضع وتسمية وهوية لفظية وأنظمة بصرية تجعل العلامة واضحة وذات صلة ومميزة.', points: ['التموضع وبنية العلامة', 'التسمية والهوية اللفظية', 'أنظمة الهوية البصرية', 'أدلة العلامة والتطبيق'], changes: 'تتوقف العلامة عن الذوبان في المشهد: موقع واحد واضح وصوت واحد وهوية واحدة في كل مكان.', problem: 'العلامة تذوب في الزحام: الموقع غير واضح، والهوية تُطبَّق بشكل غير متسق، والرسالة تتغيّر بتغيّر المتحدث.', stack: ['Figma', 'Frontify', 'Notion', 'Adobe Creative Cloud'] },
      { name: 'الويب والتجارب الرقمية', desc: 'مواقع مؤسسية ومنصات وتجارب رقمية تركز على التحويل، مصممة حول سلوك المستخدم الحقيقي.', points: ['بنية UX والنماذج الأولية', 'مواقع مؤسسية وحملات', 'تجارب التجارة الإلكترونية', 'أسس الأداء وإمكانية الوصول وSEO'], changes: 'يتحول الموقع من كتيّب تعريفي إلى أفضل مندوب مبيعات لديك.', problem: 'يصل الزوار لكن المسار غير واضح: الموقع يشرح العلامة دون أن يقود الناس بكفاءة نحو إجراء، ولم يُبنَ ليُقاس.', stack: ['Next.js', 'Vercel', 'Figma', 'GA4', 'Google Tag Manager'] },
      { name: 'النمو والأداء', desc: 'اكتساب العملاء والتسويق بالأداء والتحليلات والتحسين متصلة في نموذج نمو واحد قابل للقياس.', points: ['حملات Google وMeta وTikTok', 'تتبع التحويلات وإعداد التحليلات', 'استراتيجية SEO والمحتوى', 'تحسين معدل التحويل وصفحات الهبوط'], changes: 'يتحول الإنفاق التسويقي إلى نظام مُقاس بدلًا من مقامرة شهرية.', problem: 'قد تجلب الحملات زيارات، لكن الاستقطاب والتحويل والقياس تعيش في أماكن منفصلة — فيصعب قراءة النمو ويصعب تحسينه أكثر.', stack: ['Google Ads', 'Meta Ads', 'GA4', 'Meta CAPI', 'Semrush', 'Hotjar'] },
      { name: 'الإنتاج الإبداعي', desc: 'أفكار حملات ومحتوى اجتماعي وإبداعات إعلانية وأنظمة بصرية صُنعت لتكسب الانتباه.', points: ['مفاهيم الحملات', 'أنظمة محتوى وسائل التواصل', 'الإبداعات الإعلانية والموشن', 'الإدارة الفنية'], changes: 'يتوقف المحتوى عن ملاحقة الترندات ويبدأ ببناء الحضور.', problem: 'الإنتاج الإبداعي غير متسق: تُنتَج الصيغ واحدة تلو الأخرى، والحملات بلا نظام، ولا يمكن للمحتوى أن يتوسّع دون فقدان الجودة.', stack: ['Adobe Creative Cloud', 'Figma', 'After Effects', 'Notion'] },
      { name: 'الذكاء الاصطناعي والأتمتة', desc: 'أدوات ذكاء اصطناعي عملية وتدفقات عمل مؤتمتة تقلل التكرار وتسرّع القرارات وتحسن العمليات.', points: ['أتمتة تدفقات العمل', 'خطوط محتوى مدعومة بالذكاء الاصطناعي', 'مساعدو الدردشة والدعم', 'أدوات داخلية وتكاملات'], changes: 'تتقلص ساعات العمل المتكرر إلى تدفقات مؤتمتة موثوقة.', problem: 'العمل اليدوي المتكرر يبطئ الفريق: تنتقل المعلومات بين الأدوات يدويًا، وتنتظر القرارات الأشخاص، ولا شيء مؤتمت مع خطوة مراجعة.', stack: ['OpenAI API', 'Zapier / Make', 'Supabase', 'Cloudflare Workers'] },
      { name: 'تطوير المنتجات الرقمية', desc: 'من التحقق من الفكرة إلى MVP والإطلاق، نصمم ونطور منتجات رقمية مفيدة قابلة للتوسع.', points: ['التحقق من الفكرة وتحديد النطاق', 'تصميم وتطوير MVP', 'تكرار المنتج والتحليلات', 'دعم الإطلاق والنمو'], changes: 'تتوقف الأفكار عن الانتظار: يتم التحقق منها وبناؤها وإطلاقها مع مجال للتوسع.', problem: 'أفكار المنتجات الجيدة تتعثّر: نطاق الـMVP غير واضح، وقرارات المنتج والتصميم والتطوير منفصلة، ولا تتحوّل الفرصة أبدًا إلى منتج مطروح.', stack: ['Next.js', 'Supabase', 'Vercel', 'Figma', 'Cloudflare'] },
    ],
    explore: 'استكشف',
  },
  servicesPage: {
    metaTitle: 'الخدمات — الاستراتيجية والتصميم والنمو والمنتج | Yoca',
    metaDescription: 'استكشف خدمات Yoca: استراتيجية العلامة، الويب والتجارب الرقمية، النمو والأداء، الإنتاج الإبداعي، أتمتة الذكاء الاصطناعي وتطوير المنتجات الرقمية.',
    eyebrow: 'الخدمات',
    deliverables: 'ماذا يشمل',
    processTitle: 'عملية واحدة. لا صناديق سوداء.',
    processSub: 'كل تعاون يسير بالإيقاع الشفاف نفسه؛ تعرف دائمًا أين وصل العمل ولماذا.',
    process: [
      { name: 'افهم', desc: 'نرسم خريطة سوقك وجمهورك وبنيتك الحالية — تبدأ القرارات من الأدلة لا الافتراضات.' },
      { name: 'حدد', desc: 'نتفق معًا على التغيير الأهم وأوضح طريق للوصول إليه.' },
      { name: 'ابنِ', desc: 'تعمل الاستراتيجية والتصميم والهندسة جنبًا إلى جنب في دورات قصيرة قابلة للمراجعة.' },
      { name: 'أطلِق', desc: 'لا شيء يُنشر مصادفة: مراجعة تجريبية وفحوصات للمحتوى وإطلاق نظيف للإنتاج.' },
      { name: 'انمُ', desc: 'نقيس ونقدم تقارير مفتوحة ونواصل تحسين ما تثبت البيانات نجاحه.' },
    ],
    tabs: { problem: 'ما المشكلة التي يحلها؟', deliverables: 'المخرجات', stack: 'البنية التقنية', changes: 'ما الذي يتغير؟' },
    stackNote: 'تُختار الأدوات وفق المشكلة — وليس العكس أبدًا.',
    flowTitle: 'كيف يتحوّل هذا إلى واقع.',
    flows: [['الموقع', 'اللغة', 'الهوية', 'التجربة'], ['الاستراتيجية', 'تجربة المستخدم', 'الواجهة', 'البناء', 'القياس'], ['الاستقطاب', 'التحويل', 'القياس', 'التحسين'], ['الفكرة', 'النظام', 'الإنتاج', 'التكييف', 'النشر'], ['المُحفِّز', 'المعالجة', 'الذكاء', 'المراجعة', 'الإجراء'], ['المشكلة', 'التدفق', 'النموذج الأولي', 'البناء', 'التكرار']],
    groups: [
      {
        key: 'brand',
        system: 'Yoca Brand System™',
        title: 'العلامة والإبداع',
        desc: 'استراتيجية العلامة والهوية والإنتاج الإبداعي متحدة في نظام واحد يجعل العلامة واضحة وذات صلة ولا تُخلط بغيرها.',
        problem: 'العلامة غير مرئية أو قابلة للاستبدال: تموضع غامض، هوية غير متسقة، وأعمال إبداعية لا تكسب الانتباه.',
        deliverables: ['التموضع وبنية العلامة', 'التسمية والهوية اللفظية', 'أنظمة الهوية البصرية', 'مفاهيم الحملات والإدارة الفنية', 'أنظمة محتوى وسائل التواصل', 'الإبداعات الإعلانية والموشن'],
        stack: ['Figma', 'Adobe Creative Cloud', 'Notion', 'Frontify'],
        changes: 'موقع سوقي أوضح، وهوية أكثر تميّزًا، وأساس إبداعي متسق.',
      },
      {
        key: 'growth',
        system: 'Yoca Growth Engine™',
        title: 'النمو والتجربة الرقمية',
        desc: 'تجارب رقمية تركز على التحويل وتسويق بالأداء متصلان في محرك نمو واحد قابل للقياس.',
        problem: 'زيارات بلا تحويل، إعلانات بلا تتبع — موقع يبدو جيدًا لكنه لا يبيع، ولا رقم واحد يقول الحقيقة.',
        deliverables: ['بنية UX ومواقع تركز على التحويل', 'تجارب التجارة الإلكترونية', 'حملات Google / Meta / TikTok', 'التتبع والتحليلات والإسناد', 'استراتيجية SEO والمحتوى', 'تحسين معدل التحويل وصفحات الهبوط'],
        stack: ['Next.js', 'GA4', 'Google Tag Manager', 'Meta CAPI', 'Semrush', 'Hotjar'],
        changes: 'مسار أكثر قابلية للقياس من الانتباه إلى الفعل، مع رحلات أوضح وإشارات تحسين أقوى.',
      },
      {
        key: 'scale',
        system: 'Yoca Scale Framework™',
        title: 'المنتج والأتمتة',
        desc: 'أتمتة الذكاء الاصطناعي وتطوير المنتجات الرقمية ليكبر العمل دون أن تكبر تعقيداته.',
        problem: 'العمليات تغرق في التكرار والأفكار الجيدة لا ترى النور: لا انضباط MVP، لا أتمتة، لا نظام منتجات.',
        deliverables: ['أتمتة تدفقات العمل', 'خطوط محتوى مدعومة بالذكاء الاصطناعي', 'مساعدو الدردشة والدعم', 'التحقق من الفكرة وتطوير MVP', 'تكرار المنتج والتحليلات', 'دعم الإطلاق والنمو'],
        stack: ['Supabase', 'Vercel', 'OpenAI API', 'Zapier / Make', 'Cloudflare'],
        changes: 'نموذج تشغيل أكثر قابلية للتوسع، بمهام متكررة أقل وأساس أقوى للمنتجات الرقمية.',
      },
    ],
  },
  products: {
    metaTitle: 'المنتجات — YocaServe وWonKick وYocaStudio وDemo Hub وLabs | Yoca',
    metaDescription: 'منظومة منتجات Yoca الخاصة: YocaServe وWonKick وYocaStudio وYoca Demo Hub وYoca Labs — تُبنى وتنمو بالأنظمة نفسها التي نطبقها على علامات عملائنا.',
    eyebrow: 'منتجات Yoca',
    heading: 'منتجات نبنيها وننمّيها بأنفسنا.',
    sub: 'منظومة منتجاتنا هي المكان الذي تُختبر فيه منهجية Yoca عمليًا — الأنظمة الاستراتيجية والإبداعية والتقنية نفسها التي نقدمها لعملائنا، مطبقة على منتجات نبنيها بأنفسنا.',
    statusLive: 'متاح',
    statusSoon: 'قيد التطوير',
    statusExp: 'تجريبي',
    liveDemo: 'عرض مباشر',
    overviewCta: 'عرض لمحة المنتج',
    enquireCta: 'اسأل عن هذا المنتج',
    enquirePrefill: 'أرغب في معرفة المزيد عن {product}.',
    items: [
      {
        key: 'yocaserve',
        name: 'YocaServe',
        category: 'تقنيات الضيافة',
        desc: 'نظام سريع ومرن للقوائم الرقمية عبر QR والخدمات الرقمية، مخصص للمطاعم والمقاهي والفنادق وقطاع الضيافة.',
        status: 'live',
        cta: 'زيارة YocaServe',
        capabilities: ['متعدد اللغات', 'طلب عبر QR', 'متوافق مع الاستضافة المشتركة'],
      },
      {
        key: 'wonkick',
        name: 'WonKick',
        category: 'كرة القدم / تفاعلي',
        desc: 'مركز ألعاب كروية تفاعلي يتيح للمشجعين بناء التشكيلات وحل تحديات كرة القدم اليومية والمنافسة عبر أنماط لعب متنوعة.',
        status: 'soon',
        cta: 'استكشف WonKick',
        capabilities: ['تحديات يومية', 'بناء التشكيلات', 'أنماط لعب تفاعلية'],
      },
      {
        key: 'yocastudio',
        name: 'YocaStudio',
        category: 'استوديو ألعاب للجوال',
        desc: 'استوديو ألعاب مستقل ضمن Yoca يطوّر تجارب ألعاب أصلية وسهلة الوصول وقابلة لإعادة اللعب على الأجهزة المحمولة.',
        status: 'soon',
        cta: 'اكتشف YocaStudio',
        capabilities: ['الجوال أولًا', 'ملكية فكرية أصلية', 'نمذجة سريعة'],
      },
      {
        key: 'demo-hub',
        name: 'Yoca Demo Hub',
        category: 'منصة عروض تجريبية',
        desc: 'واجهة متعددة اللغات للمفاهيم الرقمية والمواقع والتجارب التي تصممها وتطورها Yoca.',
        status: 'live',
        cta: 'زيارة Demo Hub',
        capabilities: ['متعدد اللغات', 'عروض حية', 'عرض معياري'],
      },
      {
        key: 'labs',
        name: 'Yoca Labs',
        category: 'التقنية الإبداعية',
        desc: 'المختبر التجريبي في Yoca للذكاء الاصطناعي البصري والتقنيات الإبداعية والجيل القادم من التجارب الرقمية.',
        status: 'exp',
        cta: 'استكشف Yoca Labs',
        capabilities: ['مدعوم بالذكاء الاصطناعي', 'تجارب بصرية', 'نمذجة سريعة'],
      },
    ],
  },
  work: {
    metaTitle: 'أعمال مختارة — علامات وتجارب رقمية | Yoca',
    metaDescription: 'علامات ومواقع ومنصات وتجارب رقمية مختارة أنشأتها Yoca عبر قطاعات وأسواق مختلفة.',
    eyebrow: 'أعمال مختارة',
    heading: 'تحديات مختلفة. قرارات واضحة. أعمال صُممت لتُحرّك.',
    sub: 'مواقع وتجارب رقمية صمّمتها YOCA وبنتها لعملائها.',
    sector: 'القطاع',
    market: 'السوق',
    year: 'السنة',
    servicesLabel: 'الخدمات',
    problem: 'الحاجة',
    approach: 'نطاق عمل Yoca',
    solution: 'ما تم تسليمه',
    result: 'نتائج موثقة',
    viewCase: 'عرض المشروع',
    backToWork: 'العودة إلى الأعمال',
    allWork: 'استعرض جميع الأعمال',
    filterAll: 'الكل',
    filterClients: 'مشاريع العملاء',
    filterConcepts: 'مشاريع مفاهيمية',
    filterProducts: 'مشاريع ومنتجات Yoca',
    metricNote: '* لا تُعرض إلا النتائج الموثقة والمعتمدة من العملاء.',
    quoteLabel: 'رأي العميل',
    resultPeriod: 'الفترة',
    resultBaseline: 'مقارنةً بـ',
    resultBasis: 'المصدر',
    empty: 'لا توجد مشاريع في هذه الفئة حتى الآن.',
    statusClient: 'دراسة حالة لعميل',
    statusConcept: 'مشروع مفاهيمي',
    statusProduct: 'منتج Yoca',
    statusVenture: 'مشروع من Yoca',
    statusExp: 'تجريبي',
    designedOutcome: 'الأثر المستهدف',
    screensLabel: 'شاشات مختارة',
    conceptNote: 'مشروع مفهومي صمّمته وطوّرته Yoca.',
    liveLabel: 'عرض مباشر',
  },
  contact: {
    metaTitle: 'تواصل مع Yoca — ابدأ مشروعك',
    metaDescription: 'أخبرنا بما تبنيه. شارك المشروع ومرحلته وما تريد تغييره، وسنساعدك على تحديد الخطوة التالية الصحيحة.',
    eyebrow: 'تواصل معنا',
    heading: 'لنبنِ الخطوة التالية معًا.',
    description: 'أخبرنا بما تعمل عليه، وأين يقف المشروع اليوم، وما الذي تريد تغييره. السياق الواضح يساعدنا على بدء محادثة أفضل.',
    name: 'الاسم الكامل',
    email: 'البريد الإلكتروني',
    company: 'الشركة أو العلامة',
    message: 'أخبرنا عن المشروع',
    submit: 'أرسل موجز المشروع',
    success: 'وصلت رسالتك. سنراجع المعلومات التي شاركتها ونرد عليك عبر البريد الإلكتروني.',
    based: 'مقرنا في تركيا، ونعمل عبر أسواق متعددة.',
    addressLabel: 'العنوان',
    direct: 'تفضل البريد الإلكتروني؟',
    website: 'موقعك أو حضورك الرقمي الحالي',
    plannerSystems: 'ما الأنظمة التي تحتاجها؟',
    plannerBudget: 'الميزانية التقديرية',
    systems: ['Yoca Brand System™', 'Yoca Growth Engine™', 'Yoca Scale Framework™', 'منتج رقمي', 'لست متأكدًا بعد'],
    budgets: ['أقل من 5,000$', '5,000$ – 15,000$', '15,000$ – 40,000$', 'أكثر من 40,000$', 'غير محددة بعد'],
    phone: 'الهاتف (اختياري)',
    launchLabel: 'فترة الإطلاق المستهدفة',
    launches: ['في أقرب وقت ممكن', 'خلال 1–3 أشهر', 'خلال 3–6 أشهر', 'أستكشف حاليًا'],
    nextTitle: 'ماذا يحدث بعد ذلك؟',
    nextSteps: ['نراجع موجز مشروعك.', 'نحدد نقطة البداية الصحيحة.', 'نتواصل معك بالخطوة التالية.'],
    scheduleTitle: 'تفضل أن نتحدث مباشرة؟',
    scheduleSub: 'احجز مكالمة تعارف مجانية لمدة 30 دقيقة ولنرسم الخطوة التالية الصحيحة معًا.',
    calendlyUrl: '',
  },
  legal: {
    formNoticeBefore: 'تجد المعلومات المتعلقة بمعالجة البيانات الشخصية التي تشاركها في هذا النموذج في ',
    formNoticeLink: 'إشعار الخصوصية',
    formNoticeAfter: '.',
    noticeTitle: 'إشعار الخصوصية',
  },
  cookies: {
    text: 'نستخدم ملفات تعريف الارتباط الأساسية لتشغيل الموقع، وملفات تحليل اختيارية لفهم كيفية استخدامه.',
    acceptAll: 'قبول الكل',
    essentialOnly: 'الضرورية فقط',
  },
  notFound: {
    heading: 'انتقلت هذه الصفحة دون أن تترك استراتيجية خلفها.',
    text: 'الصفحة التي تبحث عنها غير موجودة أو ربما تم نقلها.',
    back: 'العودة إلى الرئيسية',
  },
  errorPage: {
    heading: 'حدث خلل من جهتنا.',
    text: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى بعد قليل.',
    retry: 'حاول مرة أخرى',
  },
  common: {
    languageSwitcher: 'اللغة',
    loading: 'جارٍ التحميل…',
  },
  hero: {
    eyebrow: 'شريك نمو إبداعي مستقل',
    title: 'نصمّم علامتك التجارية ونُطلقها في العالم الرقمي.',
    description:
      'نجمع هوية العلامة والمواقع الإلكترونية والمنتجات الرقمية والتسويق وفق ما يحتاجه مشروعك.',
    emphasis: ['الرقمي'],
    primaryCta: 'ابدأ مشروعك',
    secondaryCta: 'فحص رقمي مجاني',
    line: 'استراتيجية. هوية. تجربة. نمو.',
  },
  systems: {
    heading: 'منهجية واحدة. ثلاثة أنظمة مترابطة.',
    sub: 'كل تعاون يسير بالتسلسل نفسه — العلامة أولًا، ثم النمو، ثم التوسع — ليقوّي كل مرحلةٍ ما بعدها.',
    items: [
      {
        name: 'Yoca Brand System™',
        tagline: 'التموضع والهوية',
        body: 'التموضع والرسالة والهوية والتجربة التي تمنح العلامة مكانة ذات معنى في سوقها.',
        points: ['التموضع والبنية', 'الهوية اللفظية والبصرية', 'مبادئ التجربة'],
      },
      {
        name: 'Yoca Growth Engine™',
        tagline: 'زخم قابل للقياس',
        body: 'التواصل والحملات والأداء والتحويل متصلة في نظام نمو واحد قابل للتكرار.',
        points: ['حملات الأداء', 'التحويل والتحليلات', 'المحتوى وSEO'],
      },
      {
        name: 'Yoca Scale Framework™',
        tagline: 'مبني ليتراكم',
        body: 'البنية التحتية والعمليات ومنظومة المنتجات اللازمة للنمو دون تعقيد لا داعي له.',
        points: ['الأتمتة والذكاء الاصطناعي', 'منظومة المنتجات', 'أدوات التشغيل'],
      },
    ],
  },
  clients: { heading: 'بتوقيع Yoca.', sub: 'مفاهيم وتجارب رقمية ومنتجات مختارة طُوّرت عبر نظام Yoca.' },
  partners: {
    heading: 'الأدوات تتغير. النظام يبقى مترابطًا.',
    sub: 'نختار المنصات المناسبة لكل مشروع، ثم نربطها عبر نموذج واحد واضح للقياس والتشغيل.',
    categories: [
      { name: 'قِس', tools: ['Google Analytics 4', 'Google Tag Manager', 'Search Console', 'Hotjar'] },
      { name: 'نمِّ', tools: ['Google Ads', 'Meta Ads', 'TikTok Ads', 'Semrush'] },
      { name: 'ابنِ', tools: ['Next.js', 'Vercel', 'Supabase', 'Cloudflare'] },
    ],
  },
  clocks: { heading: 'نعمل عبر أسواق ومناطق زمنية متعددة.', sub: 'مقرنا في تركيا، ومتصلون بمشاريع في أوروبا والقوقاز ومنطقة الشرق الأوسط وشمال أفريقيا وما بعدها.', active: 'التوقيتات المحلية الحالية في مناطق عملنا.', istanbul: 'إسطنبول', baku: 'باكو', london: 'لندن', dubai: 'دبي' },
  team: {
    heading: 'الأشخاص خلف النظام.',
    sub: 'فريق صغير من الخبراء يعمل دون طبقات — الاستراتيجية والإبداع والهندسة والنمو جنبًا إلى جنب.',
    linkedin: 'ملف LinkedIn لـ',
  },
  cta: {
    heading: 'ماذا تبني تاليًا؟',
    body: 'أخبرنا أين أنت اليوم، وإلى أين تريد الوصول، وما الذي يقف في الطريق. سنساعدك على تحديد الخطوة التالية الصحيحة.',
    button: 'ابدأ المحادثة',
  },
  home: {
    ctaWork: 'استعرض المشاريع',
    ctaBrief: 'حدّثنا عن مشروعك',
    reelLabel: 'عمل مختار',
    workEyebrow: 'مشاريع مختارة',
    workTitle: 'مختارات من أعمال صمّمناها وطوّرناها.',
    workAll: 'كل المشاريع',
    servicesTitle: 'ماذا نقدّم',
    relatedWork: 'عملنا في هذا المجال',
    serviceLink: 'استكشف الخدمة',
    processEyebrow: 'المنهجية',
    processTitle: 'كل مشروع يسير بالإيقاع الواضح نفسه.',
    processSub: 'نرى معًا في كل وقت المرحلة التي نحن فيها والخطوة التالية.',
    process: [
      { name: 'الفهم', desc: 'ندرس معًا علامتك وجمهورك والوضع الحالي، ونحدد ما الذي يجب أن يتغير.' },
      { name: 'التصميم', desc: 'نشكّل قرارات الهوية والمحتوى والواجهة عبر مسودات يمكنك مراجعتها.' },
      { name: 'التطوير', desc: 'نحوّل التصميم المعتمد إلى بنية سريعة وسهلة الوصول يستطيع فريقك إدارتها.' },
      { name: 'الإطلاق', desc: 'بعد مراجعة المعاينة وتدقيق المحتوى نطلق العمل بشكل منظّم.' },
      { name: 'التحسين', desc: 'بعد الإطلاق نقيس ونتعلّم ونطوّر معًا النقاط التي تحتاج إلى ذلك.' },
    ],
    checkupHow: 'كيف يعمل؟',
    checkupSteps: [
      { title: 'أجب عن الأسئلة', desc: 'أسئلة قصيرة عن علامتك وموقعك وقنواتك وأهدافك، وعددها {n}.' },
      { title: 'نراجع إجاباتك', desc: 'يقرأ فريقنا إجاباتك.' },
      { title: 'تعرّف على أولوياتك', desc: 'نرسل إلى بريدك الإلكتروني تقييمًا مرتّبًا حسب الأولوية وخطوات تالية واضحة.' },
    ],
    checkupLooks: 'ما الذي ننظر فيه',
    insightsTitle: 'أحدث المقالات',
    closingChannels: 'تواصل معنا مباشرة',
    channelEmail: 'البريد الإلكتروني',
    channelForm: 'نموذج التواصل',
  },
  caseView: {
    nextProject: 'المشروع التالي',
    desktop: 'سطح المكتب',
    mobile: 'الجوال',
    inUse: 'أثناء الاستخدام',
    visitSite: 'زيارة الموقع',
  },
  footer: {
    message: 'تستحق الأفكار الجيدة نظامًا يدفعها إلى الأمام.',
    rights: 'Yoca. Your Own Creative Agency. جميع الحقوق محفوظة.',
    company: 'الشركة',
    connect: 'تواصل',
    hook: 'ما الذي نبنيه معًا تاليًا؟',
    hookCta: 'ابدأ مشروعك',
    colSystems: 'الأنظمة',
    colProducts: 'المنتجات',
    exploreProducts: 'استكشف منتجات Yoca',
    gatewayProject: 'للعلامات المستعدة لتحديد خطوتها التالية وبنائها.',
    gatewayCheckup: 'للأعمال التي تحتاج رؤية أوضح لما يجب تحسينه أولًا.',
    gatewayProducts: 'شاهد المنتجات الرقمية التي نبنيها ونختبرها وننمّيها داخل Yoca.',
  },
  about: {
    metaTitle: 'من نحن — Yoca | Your Own Creative Agency',
    metaDescription: 'Yoca شريك نمو إبداعي مستقل يربط الاستراتيجية والتصميم والتقنية والأداء في نظام واحد. تعرف على المنهجية والقيم والفريق.',
    eyebrow: 'من نحن',
    heading: 'قريبون بما يكفي لنفكر كفريقك. مستقلون بما يكفي لنتحداه.',
    sub: 'Your Own Creative Agency.',
    storyTitle: 'لماذا وُجدنا',
    story1: 'معظم العلامات لا تفشل بسبب نقص الأفكار، بل لأن الاستراتيجية والتصميم والتقنية والتسويق تعيش في غرف منفصلة، يديرها موردون منفصلون وتقيسها أرقام منفصلة.',
    story2: 'وُلدت Yoca لسد هذه الفجوة. نعمل كفريق واحد صغير من الخبراء حول سؤال واحد: ما الذي يجب أن يتغير فعلًا لتنمو هذه العلامة — وما أوضح طريقة لبنائه؟',
    story3: 'ولهذا نُدعى Your Own Creative Agency: نعمل بشكل مدمج وشفاف وخاضع للمساءلة، أقرب إلى فريق داخلي منه إلى مورد خارجي.',
    valuesTitle: 'المبادئ التي نعمل بها',
    valuesSub: 'ليست ملصقات جدارية — بل القواعد الفعلية التي تشكل القرارات اليومية في كل مشروع.',
    values: [
      { title: 'الدليل قبل الافتراض', body: 'يوجَّه العمل بالبحث وبيانات السلوك والأداء. نستخدم الدليل لتحدي الافتراضات — لا ليحل محل الحكم المهني.' },
      { title: 'النتائج قبل النشاط', body: 'مزيد من النشاط لا يصنع تلقائيًا مزيدًا من القيمة. نركز على التغيير الجوهري الذي يجب أن يحدثه العمل.' },
      { title: 'وضوح بلا صناديق سوداء', body: 'ترى التفكير والأولويات والدليل خلف كل قرار مهم.' },
      { title: 'إتقان بهدف', body: 'كل قرار بصري أو تقني يجب أن يكسب مكانه بالوضوح أو الفائدة أو الأداء.' },
    ],
    manifesto: ['فكّر بوضوح.', 'ابنِ بقصد.', 'قِس بصدق.', 'حسّن باستمرار.'],
    stackTitle: 'الأدوات تتغير. النظام يبقى مترابطًا.',
    stackSub: 'قد يتغير مزيج المنصات من مشروع لآخر. ما يبقى ثابتًا هو طريقة ترابط الاستراتيجية والتنفيذ والقياس.',
    builtTitle: 'كيف نحن مبنيّون',
    builtLines: ['فريق مضغوط.', 'تفكير رفيع الخبرة.', 'نظام واحد يتحمّل المسؤولية.', 'مبنيّ حول المشكلة.'],
  },
  checkup: {
    eyebrow: 'الفحص الرقمي',
    title: 'ما مدى صحة حضورك الرقمي؟',
    description:
      'أجب عن بضعة أسئلة قصيرة حول علامتك وقنواتك وأهدافك. سنراجع إجاباتك ونعد تحليلًا رقميًا شخصيًا بخطوات واضحة.',
    introTitle: 'لنقيّم معًا وضع علامتك التجارية رقميًا.',
    sampleTitle: 'الصحة الرقمية',
    sampleLabel: 'نتيجة نموذجية',
    sampleNote: 'قيم توضيحية للعرض فقط — يُعدّ تقريرك الحقيقي من إجاباتك الخاصة.',
    introSub:
      'أجب عن 16 سؤالًا مركزًا حول علامتك وموقعك وقنواتك وقياسك وجاهزيتك للنمو. نراجع إجاباتك ونرسل لك تقييمًا مرتّبًا بالأولوية مع خطوات تالية واضحة.',
    introStart: 'ابدأ فحصي',
    introPoints: ['نحو 3 دقائق للإجابة', '16 سؤالًا مركزًا', 'يراجعها شخص، لا تُرسل آليًا', 'خطوات تالية واضحة'],
    sectionWord: 'القسم',
    sections: [
      { key: 'business', label: 'العمل' },
      { key: 'website', label: 'الموقع' },
      { key: 'marketing', label: 'التسويق' },
      { key: 'brand', label: 'العلامة' },
      { key: 'measurement', label: 'القياس' },
      { key: 'goals', label: 'الأهداف' },
    ],
    step: 'الخطوة',
    of: 'من',
    next: 'التالي',
    back: 'السابق',
    submit: 'أرسل تحليلي',
    contactTitle: 'اقتربنا من النهاية. أين نرسل تحليلك؟',
    contactDesc: 'نراجع كل فحص شخصيًا ونرد بتقييم قصير وصادق.',
    name: 'الاسم الكامل',
    company: 'الشركة أو العلامة',
    email: 'البريد الإلكتروني',
    phone: 'رقم الهاتف',
    success: 'وصلت إجاباتك. سنُعدّ تقييمك ونرسله إلى بريدك الإلكتروني.',
    errorRequired: 'يرجى تعبئة الحقول المطلوبة.',
    errorEmail: 'يرجى إدخال بريد إلكتروني صحيح.',
    errorGeneric: 'حدث خطأ ما. حاول مرة أخرى أو راسلنا مباشرة عبر البريد الإلكتروني.',
    questions: [
      { key: 'sector', title: 'ما هو قطاعك؟', options: ['التجارة الإلكترونية / التجزئة', 'الخدمات المهنية', 'الضيافة / السياحة', 'الرعاية الصحية', 'التقنية / SaaS', 'العقارات / الإنشاءات', 'أخرى'] },
      { key: 'audience', title: 'لمن تبيع؟', options: ['للشركات (B2B)', 'للمستهلكين (B2C)', 'كلاهما'] },
      { key: 'size', title: 'ما حجم فريقك؟', options: ['أنا فقط', '2–10 أشخاص', '11–50 شخصًا', 'أكثر من 50'] },
      { key: 'website', title: 'كيف تصف موقعك الإلكتروني؟', options: ['لا نملك موقعًا', 'قديم — لا نفخر به', 'جديد لكنه لا يحقق نتائج', 'حديث ويعمل جيدًا'] },
      { key: 'mobile', title: 'هل موقعك مريح على الهاتف؟', options: ['لا / لست متأكدًا', 'جزئيًا', 'نعم، متوافق تمامًا مع الجوال'] },
      { key: 'ecommerce', title: 'هل تبيع عبر الإنترنت؟', options: ['لا مبيعات إلكترونية', 'عبر الأسواق الإلكترونية فقط', 'متجرنا الإلكتروني الخاص', 'متجر خاص + أسواق إلكترونية'] },
      { key: 'seo', title: 'ما وضع تحسين محركات البحث (SEO)؟', options: ['لم نعمل عليه أبدًا', 'جربنا ثم توقفنا', 'مستمر لكنه محدود', 'زيارات عضوية قوية'] },
      { key: 'content', title: 'كم مرة تنشر محتوى؟', options: ['نادرًا / أبدًا', 'أحيانًا', 'بانتظام ووفق خطة'] },
      { key: 'google_ads', title: 'هل تدير إعلانات Google؟', options: ['لا', 'فعلنا سابقًا', 'نعم، نديرها بأنفسنا', 'نعم، بإدارة احترافية'] },
      { key: 'meta_ads', title: 'هل تدير إعلانات Meta (إنستغرام / فيسبوك)؟', options: ['لا', 'فعلنا سابقًا', 'نعم، نديرها بأنفسنا', 'نعم، بإدارة احترافية'] },
      { key: 'other_channels', title: 'هل لديك قنوات نشطة أخرى؟', options: ['لا يوجد', 'TikTok', 'LinkedIn', 'YouTube', 'أكثر من واحدة'] },
      { key: 'social', title: 'ما مدى نشاط وسائل التواصل لديكم؟', options: ['غير نشطة', 'نشر غير منتظم', 'نشر منتظم', 'مجتمع قوي ومتفاعل'] },
      { key: 'analytics', title: 'كيف تقيس نتائجك؟', options: ['لا نقيس', 'التحليلات مثبتة لكن غير مستخدمة', 'نتابع التقارير بانتظام', 'قياس كامل مع تتبع التحويلات'] },
      { key: 'crm', title: 'كيف تتابع العملاء المحتملين؟', options: ['لا نتابعهم', 'جداول / ملاحظات', 'أداة CRM بسيطة', 'CRM متكامل مع أتمتة'] },
      { key: 'budget', title: 'ما ميزانيتك التسويقية الشهرية؟', options: ['لا ميزانية ثابتة', 'أقل من 1,000$', '1,000$ – 5,000$', 'أكثر من 5,000$'] },
      { key: 'goal', title: 'ما هدف النمو الرئيسي لديك؟', options: ['الوعي بالعلامة', 'المزيد من العملاء المحتملين', 'نمو المبيعات الإلكترونية', 'إطلاق سوق أو منتج جديد', 'كفاءة أعلى مما نملكه'] },
    ],
  },
};

const dictionaries: Record<Locale, Dict> = { en, tr, az, ar };

export function getDict(locale: Locale): Dict {
  return dictionaries[locale] ?? dictionaries.en;
}

/** Server-side scoring weights (mirrored in app/api/checkup/route.ts). */
export const CHECKUP_WEIGHTS: Record<string, number[]> = {
  website: [0, 1, 1, 3],
  mobile: [0, 1, 3],
  seo: [0, 1, 2, 3],
  content: [0, 1, 3],
  google_ads: [0, 1, 2, 3],
  meta_ads: [0, 1, 2, 3],
  social: [0, 1, 2, 3],
  analytics: [0, 1, 2, 3],
  crm: [0, 1, 2, 3],
};
