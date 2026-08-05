// khedmaPro marketing site — tiny 3-language i18n
// Works with data-i18n attributes on any element. HTML fallback = English.
// Persists selection in localStorage. Applies dir=rtl for Arabic.
(function () {
  "use strict";
  const STORAGE_KEY = "khedmapro_site_lang";
  const LANGS = [
    { code: "en", label: "English", native: "English" },
    { code: "fr", label: "French", native: "Français" },
    { code: "ar", label: "Arabic", native: "العربية" },
  ];

  const dict = {
    en: {
      // Nav / Footer / global
      "nav.how": "How it works",
      "nav.providers": "For providers",
      "nav.contact": "Contact",
      "nav.open": "Open app",
      "nav.language": "Language",
      "footer.product": "Product",
      "footer.company": "Company",
      "footer.advertise": "Advertise with us",
      "footer.terms": "Terms of service",
      "footer.privacy": "Privacy policy",
      "footer.fine": "© 2026 khedmaPro. Made in Algeria 🇩🇿",
      "footer.tagline": "Trusted local service providers across Algeria — verified, rated, ready to help.",

      // Home
      "home.title": "khedmaPro — Trusted local pros in Algeria, one tap away",
      "home.desc": "Book plumbers, electricians, cleaners, tutors and more across all 58 wilayas of Algeria. Verified, rated, and ready when you need them.",
      "home.badge": "🇩🇿 Made for Algeria",
      "home.h1a": "Your city's",
      "home.h1b": "trusted pros,",
      "home.h1c": "one tap away.",
      "home.lede": "khedmaPro connects Algerian clients with vetted service providers across all 58 wilayas — plumbers, electricians, cleaners, tutors, and more. Book in seconds, chat before you commit, and pay only what's agreed.",
      "home.cta.browse": "Browse services",
      "home.cta.provider": "I'm a provider",
      "home.trust.wilayas": "Wilayas",
      "home.trust.langs": "Languages",
      "home.trust.trial": "Days free trial",
      "home.why.eyebrow": "Why khedmaPro",
      "home.testi.eyebrow": "Community",
      "home.testi.h2": "Real people, real feedback",
      "home.why.h2": "A trust-first way to hire local pros.",
      "home.why.p": "We built khedmaPro so Algerians can find real, verified service providers without the guesswork.",
      "home.f1.t": "Verified providers",
      "home.f1.p": "Every provider goes through an ID check and admin review before their profile goes live.",
      "home.f2.t": "Instant booking",
      "home.f2.p": "Book at the listed rate, or request a custom quote for bigger jobs. All in a few taps.",
      "home.f3.t": "In-app chat",
      "home.f3.p": "Message before you commit. Phone numbers stay private until a booking is confirmed.",
      "home.f4.t": "Real ratings",
      "home.f4.p": "Reviews only from clients who actually completed a booking. No fake stars, ever.",
      "home.f5.t": "Wilaya + radius search",
      "home.f5.p": "Filter by wilaya, or use your location to find pros within 2, 5, 10 or 25 km.",
      "home.f6.t": "Multi-language",
      "home.f6.p": "Full experience in English, French and Arabic — with proper right-to-left support.",
      "home.finalCta.h2": "Ready to find your next pro?",
      "home.finalCta.p": "Browsing is free and doesn't require an account.",
      "home.finalCta.btn": "Open the app →",

      // How it works
      "how.title": "How it works — khedmaPro",
      "how.desc": "Discover, chat, book, and rate — the flow that keeps everyone honest.",
      "how.eyebrow": "How it works",
      "how.h1a": "Simple, safe,",
      "how.h1b": "and Algerian.",
      "how.lede": "Four steps to get the job done — with trust built into every one.",
      "how.s1.t": "1. Search & filter",
      "how.s1.p": "Pick a service category, choose a wilaya, or use your GPS to find pros within 2–25 km. Guest browsing is free — no account required.",
      "how.s2.t": "2. Chat privately",
      "how.s2.p": "Message any provider from the app. Phone numbers stay private until a booking is confirmed by both sides.",
      "how.s3.t": "3. Book — instant or by quote",
      "how.s3.p": "Book at the listed hourly/task rate, or request a custom quote for complex jobs. Every price is transparent.",
      "how.s4.t": "4. Confirm & rate",
      "how.s4.p": "Both sides mark the job complete. Payment happens directly. You can then rate the provider — reviews only count when the job is done.",
      "how.safe.eyebrow": "Trust & safety",
      "how.safe.h2": "Built-in safety features.",
      "how.safe.g1.t": "ID verified",
      "how.safe.g1.p": "Providers submit government ID + selfie. Reviewed by our team before going live.",
      "how.safe.g2.t": "Private phone",
      "how.safe.g2.p": "Client and provider phone numbers never appear in public listings.",
      "how.safe.g3.t": "Report & flag",
      "how.safe.g3.p": "One tap to report a provider. Repeat issues auto-flag their profile for admin review.",
      "how.safe.g4.t": "Offline schedule",
      "how.safe.g4.p": "Providers can view their booked schedule even without internet — great on job sites.",
      "how.cta.h2": "See it in action.",
      "how.cta.p": "Open the app and browse — no signup needed to look around.",
      "how.cta.btn": "Open the app →",

      // For providers
      "prov.title": "For providers — khedmaPro",
      "prov.desc": "Grow your service business across all 58 Algerian wilayas. 90 days free, then 1000 DA / month.",
      "prov.eyebrow": "For service providers",
      "prov.h1a": "Grow your business —",
      "prov.h1b": "in every wilaya.",
      "prov.lede": "Whether you're a solo plumber in Constantine or a cleaning crew in Oran, khedmaPro puts you in front of clients actively looking for what you offer.",
      "prov.cta.start": "Get started free",
      "prov.cta.contact": "Contact us",
      "prov.pricing.eyebrow": "Pricing",
      "prov.pricing.h2": "Straightforward pricing.",
      "prov.pricing.p": "Start free. Pay a flat monthly fee only after your trial ends. No revenue cuts, no percentage on your bookings.",
      "prov.plan.trial.t": "Free trial",
      "prov.plan.trial.price": "0 DA",
      "prov.plan.trial.p": "First 90 days",
      "prov.plan.trial.l1": "Full profile visibility",
      "prov.plan.trial.l2": "All booking features",
      "prov.plan.trial.l3": "Unlimited chats",
      "prov.plan.trial.l4": "No card required",
      "prov.plan.active.t": "Active",
      "prov.plan.active.price": "1000 DA",
      "prov.plan.active.priceSub": "/ month",
      "prov.plan.active.p": "After trial ends",
      "prov.plan.active.l1": "Stay listed & visible",
      "prov.plan.active.l2": "Priority in search",
      "prov.plan.active.l3": "Portfolio + gallery",
      "prov.plan.active.l4": "Verification badge",
      "prov.perks.h2": "What you get.",
      "prov.perks.p": "Everything you need to run your service business inside one app.",
      "prov.p1.t": "New clients daily",
      "prov.p1.p": "Get discovered by clients in your wilaya (and beyond) actively searching for your service.",
      "prov.p2.t": "Portfolio & bio",
      "prov.p2.p": "Show your past work with photos, tags, and a professional bio in 3 languages.",
      "prov.p3.t": "Verified badge",
      "prov.p3.p": "Earn the verified checkmark — clients trust and book you 3× more often.",
      "prov.p4.t": "Simple pricing",
      "prov.p4.p": "Set hourly or per-task rates. Accept instant bookings or send custom quotes.",
      "prov.p5.t": "Offline schedule",
      "prov.p5.p": "See today's bookings and add private notes — works even without internet on-site.",
      "prov.p6.t": "Your schedule",
      "prov.p6.p": "Publish working hours, breaks, and vacation days. Block times you're unavailable.",
      "prov.finalCta.h2": "Start growing today.",
      "prov.finalCta.p": "90 days free. No card. Cancel anytime.",
      "prov.finalCta.btn": "Sign up as a provider →",

      // Contact
      "contact.title": "Contact — khedmaPro",
      "contact.desc": "Get in touch with the khedmaPro team. Support, partnerships, press.",
      "contact.eyebrow": "Contact",
      "contact.h1a": "Talk to",
      "contact.h1b": "the team.",
      "contact.lede": "Questions, partnerships, feedback, or just saying hi — we'd love to hear from you.",
      "contact.tile.support": "Support",
      "contact.tile.phone": "Phone",
      "contact.tile.partners": "Partnerships",
      "contact.tile.ads": "Advertising",
      "contact.tile.press": "Press",
      "contact.tile.made": "Made in",
      "contact.tile.madeVal": "Algiers, Algeria 🇩🇿",
      "contact.ads.eyebrow": "Advertise with us",
      "contact.ads.h2": "Promote your business inside khedmaPro",
      "contact.ads.p": "Reach thousands of Algerian home & business owners actively searching for services. We work with local brands, insurers, banks, telcos, hardware suppliers and retail chains. Banner slots are curated and rotated for high visibility.",
      "contact.ads.card.t": "Want to run partner ads in the app?",
      "contact.ads.card.p": "Email us with your brand, target audience (wilaya, category), preferred dates, and creative assets. We reply within 2 business days with rates and slot availability.",
      "contact.ads.btn": "Contact advertising team →",
      "contact.msg.eyebrow": "Message us",
      "contact.msg.h2": "Send a note",
      "contact.msg.p": "We reply within 2 business days. For urgent booking issues, please use the in-app chat.",
      "contact.form.name": "Your name",
      "contact.form.namePh": "Karim Benali",
      "contact.form.email": "Email",
      "contact.form.emailPh": "you@example.dz",
      "contact.form.subject": "Subject",
      "contact.form.subjectPh": "What's this about?",
      "contact.form.msg": "Message",
      "contact.form.msgPh": "Tell us what's on your mind…",
      "contact.form.btn": "Send message →",

      // Terms
      "terms.title": "Terms of service — khedmaPro",
      "terms.desc": "The rules that keep khedmaPro fair for clients, providers, and the platform.",
      "terms.eyebrow": "Terms of service",
      "terms.h1": "Terms of service.",
      "terms.updated": "Last updated: June 2026",
      "terms.s1.h": "1. Overview",
      "terms.s1.p": "khedmaPro is a marketplace connecting clients with independent service providers. We don't perform the services ourselves — we facilitate the connection and handle discovery, booking, chat, and reviews.",
      "terms.s2.h": "2. Accounts",
      "terms.s2.p": "You must be 18+ to use khedmaPro. Providers must offer accurate professional information, valid ID, and comply with local law. Clients must not misuse the platform, spam providers, or create fake accounts.",
      "terms.s3.h": "3. Payment & commission",
      "terms.s3.p": "Providers pay a flat 1000 DA monthly subscription (after the 90-day free trial) to stay listed. Booking payments happen directly between client and provider unless integrated via Chargily Pay. khedmaPro does not take a percentage on the job payment.",
      "terms.s4.h": "4. Reviews & flags",
      "terms.s4.p": "Reviews can only be left by clients whose booking has been completed. Providers with a high rate of complaints, no-shows, or fraudulent behavior may be auto-flagged or manually deactivated. Serious violations may result in permanent removal.",
      "terms.s5.h": "5. Cancellations & refunds",
      "terms.s5.p": "Both parties can cancel a booking before it's confirmed. After confirmation, cancellations should be handled directly between client and provider. Refunds — if any — are the provider's responsibility.",
      "terms.s6.h": "6. Contact",
      "terms.s6.p": "For any question about these terms, email us at support@khedmapro.dz.",

      // Privacy
      "priv.title": "Privacy policy — khedmaPro",
      "priv.desc": "How khedmaPro handles your personal data, phone numbers, and location.",
      "priv.eyebrow": "Privacy policy",
      "priv.h1": "Privacy policy.",
      "priv.updated": "Last updated: June 2026",
      "priv.s1.h": "1. What we collect",
      "priv.s1.p": "We collect the info you provide when creating an account (name, email, phone), your wilaya/city, service category, portfolio photos, and — with permission — your GPS location for radius search. We store chat messages, bookings, and reviews to run the marketplace.",
      "priv.s2.h": "2. What we don't sell",
      "priv.s2.p": "We never sell your personal data to third parties. Full stop.",
      "priv.s3.h": "3. Phone privacy",
      "priv.s3.p": "Client and provider phone numbers are hidden from public search results and profiles. They become visible to the other party only after a booking has been mutually confirmed — and every reveal is logged.",
      "priv.s4.h": "4. Location data",
      "priv.s4.p": "GPS coordinates are used only to compute distance from your search location. We don't store precise historical location traces. If you deny location permission, we fall back to wilaya-level filtering, which works fine.",
      "priv.s5.h": "5. Verification documents",
      "priv.s5.p": "Providers upload ID + optional certifications for admin review. These documents are stored encrypted, viewed only by admins, and never shown to clients. They can be deleted upon written request.",
      "priv.s6.h": "6. Data deletion",
      "priv.s6.p": "You can deactivate your account at any time from Profile → Settings → Deactivate. Full deletion is available on request via support@khedmapro.dz — we delete personal data within 30 days.",
      "priv.s7.h": "7. Contact",
      "priv.s7.p": "For privacy questions or GDPR-style requests, email support@khedmapro.dz.",
    },
    fr: {
      "nav.how": "Comment ça marche",
      "nav.providers": "Prestataires",
      "nav.contact": "Contact",
      "nav.open": "Ouvrir l'app",
      "nav.language": "Langue",
      "footer.product": "Produit",
      "footer.company": "Entreprise",
      "footer.advertise": "Annoncer chez nous",
      "footer.terms": "Conditions d'utilisation",
      "footer.privacy": "Politique de confidentialité",
      "footer.fine": "© 2026 khedmaPro. Fait en Algérie 🇩🇿",
      "footer.tagline": "Prestataires de services locaux de confiance en Algérie — vérifiés, notés, prêts à vous aider.",

      "home.title": "khedmaPro — Prestataires de confiance en Algérie, à un clic",
      "home.desc": "Réservez plombiers, électriciens, femmes de ménage, professeurs et plus dans les 58 wilayas d'Algérie. Vérifiés, notés, disponibles quand il faut.",
      "home.badge": "🇩🇿 Conçu pour l'Algérie",
      "home.h1a": "Les pros de confiance",
      "home.h1b": "de votre ville,",
      "home.h1c": "à un clic.",
      "home.lede": "khedmaPro connecte les clients algériens à des prestataires vérifiés dans les 58 wilayas — plombiers, électriciens, ménage, cours particuliers et plus. Réservez en quelques secondes, discutez avant de vous engager, et payez uniquement le prix convenu.",
      "home.cta.browse": "Parcourir les services",
      "home.cta.provider": "Je suis un prestataire",
      "home.trust.wilayas": "Wilayas",
      "home.trust.langs": "Langues",
      "home.trust.trial": "Jours d'essai gratuit",
      "home.why.eyebrow": "Pourquoi khedmaPro",
      "home.testi.eyebrow": "Communauté",
      "home.testi.h2": "De vraies personnes, de vrais retours",
      "home.why.h2": "Une manière de recruter fondée sur la confiance.",
      "home.why.p": "Nous avons conçu khedmaPro pour que les Algériens trouvent des prestataires réels et vérifiés, sans deviner.",
      "home.f1.t": "Prestataires vérifiés",
      "home.f1.p": "Chaque prestataire passe un contrôle d'identité et un examen admin avant que son profil soit publié.",
      "home.f2.t": "Réservation instantanée",
      "home.f2.p": "Réservez au tarif affiché, ou demandez un devis personnalisé pour les gros travaux. Le tout en quelques clics.",
      "home.f3.t": "Chat intégré",
      "home.f3.p": "Discutez avant de vous engager. Les numéros de téléphone restent privés jusqu'à la confirmation de la réservation.",
      "home.f4.t": "Notes réelles",
      "home.f4.p": "Avis uniquement de clients ayant réellement terminé une réservation. Aucune fausse note.",
      "home.f5.t": "Recherche par wilaya + rayon",
      "home.f5.p": "Filtrez par wilaya, ou utilisez votre position pour trouver des pros dans un rayon de 2, 5, 10 ou 25 km.",
      "home.f6.t": "Multilingue",
      "home.f6.p": "Expérience complète en français, anglais et arabe — avec un vrai support droite-à-gauche.",
      "home.finalCta.h2": "Prêt à trouver votre prochain pro ?",
      "home.finalCta.p": "Parcourir est gratuit et ne nécessite pas de compte.",
      "home.finalCta.btn": "Ouvrir l'app →",

      "how.title": "Comment ça marche — khedmaPro",
      "how.desc": "Découvrir, discuter, réserver, noter — le flux qui garde tout le monde honnête.",
      "how.eyebrow": "Comment ça marche",
      "how.h1a": "Simple, sûr,",
      "how.h1b": "et algérien.",
      "how.lede": "Quatre étapes pour faire le travail — avec la confiance intégrée à chacune.",
      "how.s1.t": "1. Recherchez & filtrez",
      "how.s1.p": "Choisissez une catégorie, une wilaya, ou utilisez votre GPS pour trouver des pros dans un rayon de 2 à 25 km. La navigation en invité est gratuite — pas de compte requis.",
      "how.s2.t": "2. Discutez en privé",
      "how.s2.p": "Envoyez un message à tout prestataire depuis l'app. Les numéros restent privés jusqu'à la confirmation mutuelle d'une réservation.",
      "how.s3.t": "3. Réservez — instantané ou sur devis",
      "how.s3.p": "Réservez au tarif horaire/à la tâche affiché, ou demandez un devis pour les travaux complexes. Chaque prix est transparent.",
      "how.s4.t": "4. Confirmez & notez",
      "how.s4.p": "Les deux parties marquent le travail terminé. Le paiement est direct. Vous pouvez ensuite noter le prestataire — les avis ne comptent qu'une fois le travail terminé.",
      "how.safe.eyebrow": "Confiance & sécurité",
      "how.safe.h2": "Fonctionnalités de sécurité intégrées.",
      "how.safe.g1.t": "Identité vérifiée",
      "how.safe.g1.p": "Les prestataires soumettent une pièce d'identité + selfie. Vérifié par notre équipe avant publication.",
      "how.safe.g2.t": "Téléphone privé",
      "how.safe.g2.p": "Les numéros de téléphone des clients et prestataires n'apparaissent jamais publiquement.",
      "how.safe.g3.t": "Signaler",
      "how.safe.g3.p": "Un clic pour signaler un prestataire. Les problèmes récurrents signalent automatiquement le profil pour examen.",
      "how.safe.g4.t": "Planning hors ligne",
      "how.safe.g4.p": "Les prestataires peuvent voir leur planning même sans internet — pratique sur le terrain.",
      "how.cta.h2": "Voyez-le en action.",
      "how.cta.p": "Ouvrez l'app et parcourez — pas besoin de compte pour regarder.",
      "how.cta.btn": "Ouvrir l'app →",

      "prov.title": "Prestataires — khedmaPro",
      "prov.desc": "Développez votre activité de services dans les 58 wilayas d'Algérie. 90 jours gratuits, puis 1000 DA / mois.",
      "prov.eyebrow": "Prestataires de services",
      "prov.h1a": "Développez votre activité —",
      "prov.h1b": "dans chaque wilaya.",
      "prov.lede": "Que vous soyez un plombier solo à Constantine ou une équipe de nettoyage à Oran, khedmaPro vous met devant les clients qui recherchent activement vos services.",
      "prov.cta.start": "Commencer gratuitement",
      "prov.cta.contact": "Nous contacter",
      "prov.pricing.eyebrow": "Tarifs",
      "prov.pricing.h2": "Tarification simple.",
      "prov.pricing.p": "Commencez gratuitement. Payez un forfait mensuel fixe seulement après la période d'essai. Aucune commission sur vos réservations.",
      "prov.plan.trial.t": "Essai gratuit",
      "prov.plan.trial.price": "0 DA",
      "prov.plan.trial.p": "Les 90 premiers jours",
      "prov.plan.trial.l1": "Visibilité complète du profil",
      "prov.plan.trial.l2": "Toutes les fonctions",
      "prov.plan.trial.l3": "Chats illimités",
      "prov.plan.trial.l4": "Sans carte bancaire",
      "prov.plan.active.t": "Actif",
      "prov.plan.active.price": "1000 DA",
      "prov.plan.active.priceSub": "/ mois",
      "prov.plan.active.p": "Après l'essai",
      "prov.plan.active.l1": "Rester listé et visible",
      "prov.plan.active.l2": "Priorité dans la recherche",
      "prov.plan.active.l3": "Portfolio + galerie",
      "prov.plan.active.l4": "Badge vérifié",
      "prov.perks.h2": "Ce que vous obtenez.",
      "prov.perks.p": "Tout ce qu'il faut pour gérer votre activité de services dans une seule app.",
      "prov.p1.t": "De nouveaux clients chaque jour",
      "prov.p1.p": "Soyez découvert par les clients de votre wilaya (et au-delà) qui cherchent activement vos services.",
      "prov.p2.t": "Portfolio & bio",
      "prov.p2.p": "Présentez vos travaux passés avec photos, tags et une bio pro en 3 langues.",
      "prov.p3.t": "Badge vérifié",
      "prov.p3.p": "Obtenez la coche de vérification — les clients vous font confiance 3× plus.",
      "prov.p4.t": "Tarification simple",
      "prov.p4.p": "Définissez des tarifs horaires ou à la tâche. Acceptez réservations instantanées ou devis.",
      "prov.p5.t": "Planning hors ligne",
      "prov.p5.p": "Consultez les réservations du jour et ajoutez des notes privées — même sans internet.",
      "prov.p6.t": "Votre planning",
      "prov.p6.p": "Publiez vos heures, pauses et congés. Bloquez les moments indisponibles.",
      "prov.finalCta.h2": "Commencez à croître aujourd'hui.",
      "prov.finalCta.p": "90 jours gratuits. Sans carte. Annulez quand vous voulez.",
      "prov.finalCta.btn": "S'inscrire comme prestataire →",

      "contact.title": "Contact — khedmaPro",
      "contact.desc": "Contactez l'équipe khedmaPro. Support, partenariats, presse.",
      "contact.eyebrow": "Contact",
      "contact.h1a": "Parler à",
      "contact.h1b": "l'équipe.",
      "contact.lede": "Questions, partenariats, retours, ou juste dire bonjour — écrivez-nous.",
      "contact.tile.support": "Support",
      "contact.tile.phone": "Téléphone",
      "contact.tile.partners": "Partenariats",
      "contact.tile.ads": "Publicité",
      "contact.tile.press": "Presse",
      "contact.tile.made": "Fait à",
      "contact.tile.madeVal": "Alger, Algérie 🇩🇿",
      "contact.ads.eyebrow": "Annoncer chez nous",
      "contact.ads.h2": "Faites la promotion de votre entreprise dans khedmaPro",
      "contact.ads.p": "Atteignez des milliers de propriétaires et professionnels algériens qui recherchent activement des services. Nous travaillons avec des marques locales, assureurs, banques, opérateurs, fournisseurs et enseignes de retail.",
      "contact.ads.card.t": "Vous voulez diffuser des annonces partenaires dans l'app ?",
      "contact.ads.card.p": "Envoyez-nous un e-mail avec votre marque, l'audience cible (wilaya, catégorie), les dates souhaitées et vos visuels. Nous répondons sous 2 jours ouvrés avec les tarifs et créneaux disponibles.",
      "contact.ads.btn": "Contacter l'équipe pub →",
      "contact.msg.eyebrow": "Écrivez-nous",
      "contact.msg.h2": "Envoyer un message",
      "contact.msg.p": "Nous répondons sous 2 jours ouvrés. Pour les urgences de réservation, utilisez le chat de l'app.",
      "contact.form.name": "Votre nom",
      "contact.form.namePh": "Karim Benali",
      "contact.form.email": "Email",
      "contact.form.emailPh": "vous@exemple.dz",
      "contact.form.subject": "Sujet",
      "contact.form.subjectPh": "Le sujet de votre message ?",
      "contact.form.msg": "Message",
      "contact.form.msgPh": "Dites-nous ce que vous avez en tête…",
      "contact.form.btn": "Envoyer →",

      "terms.title": "Conditions d'utilisation — khedmaPro",
      "terms.desc": "Les règles qui gardent khedmaPro équitable pour tous.",
      "terms.eyebrow": "Conditions d'utilisation",
      "terms.h1": "Conditions d'utilisation.",
      "terms.updated": "Dernière mise à jour : juin 2026",
      "terms.s1.h": "1. Aperçu",
      "terms.s1.p": "khedmaPro est une place de marché qui connecte les clients à des prestataires indépendants. Nous ne réalisons pas les services nous-mêmes — nous facilitons la connexion, la découverte, la réservation, le chat et les avis.",
      "terms.s2.h": "2. Comptes",
      "terms.s2.p": "Vous devez avoir 18 ans ou plus pour utiliser khedmaPro. Les prestataires doivent fournir des informations exactes, une pièce d'identité valide, et respecter la loi locale.",
      "terms.s3.h": "3. Paiement & commission",
      "terms.s3.p": "Les prestataires paient un abonnement mensuel fixe de 1000 DA (après les 90 jours d'essai gratuit) pour rester listés. Les paiements des réservations sont directs entre client et prestataire, sauf via Chargily Pay. khedmaPro ne prélève aucune commission sur le paiement du travail.",
      "terms.s4.h": "4. Avis & signalements",
      "terms.s4.p": "Seuls les clients dont la réservation est terminée peuvent laisser un avis. Les prestataires avec un fort taux de plaintes, d'absences, ou de comportement frauduleux peuvent être signalés ou désactivés.",
      "terms.s5.h": "5. Annulations & remboursements",
      "terms.s5.p": "Les deux parties peuvent annuler avant confirmation. Après confirmation, l'annulation se gère directement. Les remboursements — s'il y en a — sont à la charge du prestataire.",
      "terms.s6.h": "6. Contact",
      "terms.s6.p": "Pour toute question, écrivez à support@khedmapro.dz.",

      "priv.title": "Politique de confidentialité — khedmaPro",
      "priv.desc": "Comment khedmaPro gère vos données personnelles, téléphones et localisation.",
      "priv.eyebrow": "Politique de confidentialité",
      "priv.h1": "Politique de confidentialité.",
      "priv.updated": "Dernière mise à jour : juin 2026",
      "priv.s1.h": "1. Ce que nous collectons",
      "priv.s1.p": "Les informations fournies lors de la création du compte (nom, email, téléphone), votre wilaya/ville, catégorie de service, photos portfolio et — avec permission — votre position GPS pour la recherche par rayon.",
      "priv.s2.h": "2. Ce que nous ne vendons pas",
      "priv.s2.p": "Nous ne vendons jamais vos données personnelles à des tiers. Point final.",
      "priv.s3.h": "3. Confidentialité du téléphone",
      "priv.s3.p": "Les numéros restent cachés des résultats publics et profils. Ils deviennent visibles à l'autre partie uniquement après confirmation mutuelle d'une réservation — et chaque révélation est journalisée.",
      "priv.s4.h": "4. Données de localisation",
      "priv.s4.p": "Les coordonnées GPS servent uniquement à calculer la distance depuis votre position. Nous ne stockons pas d'historique précis. Si vous refusez la permission, le filtrage par wilaya prend le relais.",
      "priv.s5.h": "5. Documents de vérification",
      "priv.s5.p": "Les prestataires téléchargent leur pièce d'identité + certifications. Documents chiffrés, consultés uniquement par les admins, jamais montrés aux clients.",
      "priv.s6.h": "6. Suppression des données",
      "priv.s6.p": "Vous pouvez désactiver votre compte à tout moment. La suppression complète est possible sur demande à support@khedmapro.dz — nous supprimons les données personnelles sous 30 jours.",
      "priv.s7.h": "7. Contact",
      "priv.s7.p": "Pour toute question de confidentialité, écrivez à support@khedmapro.dz.",
    },
    ar: {
      "nav.how": "كيف يعمل",
      "nav.providers": "للمزوّدين",
      "nav.contact": "اتصل بنا",
      "nav.open": "افتح التطبيق",
      "nav.language": "اللغة",
      "footer.product": "المنتج",
      "footer.company": "الشركة",
      "footer.advertise": "أعلن معنا",
      "footer.terms": "شروط الاستخدام",
      "footer.privacy": "سياسة الخصوصية",
      "footer.fine": "© 2026 khedmaPro. صُنع في الجزائر 🇩🇿",
      "footer.tagline": "مزوّدو خدمات محليون موثوقون في الجزائر — موثّقون، مُقيَّمون، جاهزون للمساعدة.",

      "home.title": "khedmaPro — محترفون محليون موثوقون في الجزائر بضغطة واحدة",
      "home.desc": "احجز سباكين، كهربائيين، عمال نظافة، مدرّسين وأكثر في كل ولايات الجزائر الـ58. موثّقون، مقيّمون، وجاهزون عند الحاجة.",
      "home.badge": "🇩🇿 صُنع للجزائر",
      "home.h1a": "محترفو مدينتك",
      "home.h1b": "الموثوقون،",
      "home.h1c": "بضغطة واحدة.",
      "home.lede": "يربط khedmaPro العملاء الجزائريين بمزوّدي خدمات موثّقين في كل الولايات الـ58 — سباكون، كهربائيون، عمال نظافة، مدرّسون والمزيد. احجز في ثوانٍ، تحدّث قبل الالتزام، وادفع فقط المتفق عليه.",
      "home.cta.browse": "تصفّح الخدمات",
      "home.cta.provider": "أنا مقدم خدمة",
      "home.trust.wilayas": "ولاية",
      "home.trust.langs": "لغات",
      "home.trust.trial": "يوم تجربة مجانية",
      "home.why.eyebrow": "لماذا khedmaPro",
      "home.testi.eyebrow": "المجتمع",
      "home.testi.h2": "أشخاص حقيقيون، آراء حقيقية",
      "home.why.h2": "طريقة قائمة على الثقة لتوظيف المحترفين المحليين.",
      "home.why.p": "بنينا khedmaPro ليتمكّن الجزائريون من إيجاد مزوّدي خدمات حقيقيين وموثّقين بدون تخمين.",
      "home.f1.t": "مزوّدون موثّقون",
      "home.f1.p": "كل مزوّد يمر بفحص هوية ومراجعة إدارية قبل نشر ملفه.",
      "home.f2.t": "حجز فوري",
      "home.f2.p": "احجز بالسعر المُعلَن، أو اطلب عرض سعر مخصّصًا للأعمال الكبيرة. كل ذلك ببضع نقرات.",
      "home.f3.t": "محادثة داخل التطبيق",
      "home.f3.p": "تحدّث قبل الالتزام. تبقى أرقام الهواتف خاصة حتى تأكيد الحجز.",
      "home.f4.t": "تقييمات حقيقية",
      "home.f4.p": "التقييمات فقط من عملاء أكملوا حجزًا فعلاً. لا نجوم مزيّفة، أبدًا.",
      "home.f5.t": "بحث بالولاية والمسافة",
      "home.f5.p": "صفِّ حسب الولاية، أو استخدم موقعك للعثور على محترفين ضمن 2 أو 5 أو 10 أو 25 كم.",
      "home.f6.t": "متعدّد اللغات",
      "home.f6.p": "تجربة كاملة بالعربية والفرنسية والإنجليزية — مع دعم كامل لليمين إلى اليسار.",
      "home.finalCta.h2": "جاهز للعثور على المحترف التالي؟",
      "home.finalCta.p": "التصفّح مجاني ولا يتطلّب حسابًا.",
      "home.finalCta.btn": "افتح التطبيق ←",

      "how.title": "كيف يعمل — khedmaPro",
      "how.desc": "اكتشف، تحدّث، احجز، وقيّم — التدفق الذي يبقي الجميع صادقًا.",
      "how.eyebrow": "كيف يعمل",
      "how.h1a": "بسيط، آمن،",
      "how.h1b": "وجزائري.",
      "how.lede": "أربع خطوات لإنجاز العمل — والثقة في كل واحدة منها.",
      "how.s1.t": "1. ابحث وصفِّ",
      "how.s1.p": "اختر فئة خدمة، اختر ولاية، أو استخدم الموقع لإيجاد محترفين ضمن 2–25 كم. التصفّح كضيف مجاني — لا حاجة لحساب.",
      "how.s2.t": "2. تحدّث بشكل خاص",
      "how.s2.p": "أرسل رسالة لأي مزوّد. تبقى الأرقام خاصة حتى تأكيد الحجز من الطرفين.",
      "how.s3.t": "3. احجز — فورًا أو بعرض سعر",
      "how.s3.p": "احجز بالسعر بالساعة/بالمهمة، أو اطلب عرض سعر للأعمال المعقّدة. كل الأسعار شفّافة.",
      "how.s4.t": "4. أكّد وقيّم",
      "how.s4.p": "يعلّم الطرفان إتمام العمل. الدفع مباشر. ثم يمكنك تقييم المزوّد — لا تُحتَسب التقييمات إلا بعد إنجاز العمل.",
      "how.safe.eyebrow": "الثقة والأمان",
      "how.safe.h2": "ميزات أمان مدمجة.",
      "how.safe.g1.t": "توثيق الهوية",
      "how.safe.g1.p": "يقدم المزوّدون بطاقة هوية + سيلفي. تراجعها فرقتنا قبل النشر.",
      "how.safe.g2.t": "هاتف خاص",
      "how.safe.g2.p": "لا تظهر أرقام هواتف العملاء والمزوّدين في القوائم العامة أبدًا.",
      "how.safe.g3.t": "إبلاغ",
      "how.safe.g3.p": "بلاغ بضغطة واحدة. تُبلَّغ المشاكل المتكرّرة تلقائيًا لمراجعة الملف.",
      "how.safe.g4.t": "جدول بدون إنترنت",
      "how.safe.g4.p": "يمكن للمزوّدين رؤية جدول حجوزاتهم حتى بدون إنترنت — مثالي في مواقع العمل.",
      "how.cta.h2": "شاهده بنفسك.",
      "how.cta.p": "افتح التطبيق وتصفّح — لا حاجة للتسجيل للمعاينة.",
      "how.cta.btn": "افتح التطبيق ←",

      "prov.title": "للمزوّدين — khedmaPro",
      "prov.desc": "طوّر نشاطك الخدمي في كل الولايات الـ58. 90 يوم مجانًا، ثم 1000 دج / شهر.",
      "prov.eyebrow": "لمقدّمي الخدمات",
      "prov.h1a": "طوّر نشاطك —",
      "prov.h1b": "في كل ولاية.",
      "prov.lede": "سواء كنت سبّاكًا مستقلًا في قسنطينة أو طاقم تنظيف في وهران، يضعك khedmaPro أمام عملاء يبحثون فعلاً عن خدمتك.",
      "prov.cta.start": "ابدأ مجانًا",
      "prov.cta.contact": "اتصل بنا",
      "prov.pricing.eyebrow": "التسعير",
      "prov.pricing.h2": "تسعير مباشر.",
      "prov.pricing.p": "ابدأ مجانًا. ادفع رسمًا شهريًا ثابتًا فقط بعد انتهاء التجربة. لا اقتطاعات على حجوزاتك.",
      "prov.plan.trial.t": "تجربة مجانية",
      "prov.plan.trial.price": "0 دج",
      "prov.plan.trial.p": "أول 90 يومًا",
      "prov.plan.trial.l1": "ظهور كامل للملف",
      "prov.plan.trial.l2": "كل ميزات الحجز",
      "prov.plan.trial.l3": "محادثات بلا حدود",
      "prov.plan.trial.l4": "بدون بطاقة",
      "prov.plan.active.t": "نشط",
      "prov.plan.active.price": "1000 دج",
      "prov.plan.active.priceSub": "/ شهر",
      "prov.plan.active.p": "بعد انتهاء التجربة",
      "prov.plan.active.l1": "ابقَ مُدرَجًا ومرئيًا",
      "prov.plan.active.l2": "أولوية في البحث",
      "prov.plan.active.l3": "بورتفوليو + معرض",
      "prov.plan.active.l4": "شارة توثيق",
      "prov.perks.h2": "ما تحصل عليه.",
      "prov.perks.p": "كل ما تحتاجه لإدارة نشاطك الخدمي داخل تطبيق واحد.",
      "prov.p1.t": "عملاء جدد يوميًا",
      "prov.p1.p": "اكتشفك العملاء في ولايتك (وما وراءها) وهم يبحثون عن خدمتك.",
      "prov.p2.t": "بورتفوليو ونبذة",
      "prov.p2.p": "اعرض أعمالك السابقة بصور، وسوم، ونبذة احترافية بثلاث لغات.",
      "prov.p3.t": "شارة التوثيق",
      "prov.p3.p": "احصل على علامة التوثيق — يثق بك العملاء ويحجزون منك 3× أكثر.",
      "prov.p4.t": "تسعير بسيط",
      "prov.p4.p": "حدّد أسعارًا بالساعة أو بالمهمة. اقبل حجوزات فورية أو أرسل عروض أسعار.",
      "prov.p5.t": "جدول بدون إنترنت",
      "prov.p5.p": "شاهد حجوزات اليوم وأضف ملاحظات خاصة — يعمل حتى دون إنترنت في الموقع.",
      "prov.p6.t": "جدولك",
      "prov.p6.p": "انشر ساعات العمل، الاستراحات، وأيام الإجازة. احجز الأوقات غير المتاحة.",
      "prov.finalCta.h2": "ابدأ النمو اليوم.",
      "prov.finalCta.p": "90 يوم مجانًا. بدون بطاقة. ألغِ في أي وقت.",
      "prov.finalCta.btn": "سجّل كمقدّم خدمة ←",

      "contact.title": "اتصل بنا — khedmaPro",
      "contact.desc": "تواصل مع فريق khedmaPro. الدعم، الشراكات، الصحافة.",
      "contact.eyebrow": "اتصل بنا",
      "contact.h1a": "تحدّث إلى",
      "contact.h1b": "الفريق.",
      "contact.lede": "أسئلة، شراكات، ملاحظات، أو فقط لتقول مرحبًا — يسعدنا سماعك.",
      "contact.tile.support": "الدعم",
      "contact.tile.phone": "الهاتف",
      "contact.tile.partners": "الشراكات",
      "contact.tile.ads": "الإعلانات",
      "contact.tile.press": "الصحافة",
      "contact.tile.made": "صُنع في",
      "contact.tile.madeVal": "الجزائر العاصمة، الجزائر 🇩🇿",
      "contact.ads.eyebrow": "أعلن معنا",
      "contact.ads.h2": "روّج لنشاطك داخل khedmaPro",
      "contact.ads.p": "الوصول إلى آلاف أصحاب المنازل والأعمال في الجزائر الذين يبحثون فعلاً عن الخدمات. نتعامل مع علامات محلية، شركات تأمين، بنوك، شركات اتصالات، موزّعين وسلاسل تجزئة.",
      "contact.ads.card.t": "هل تريد إعلانات شريكة في التطبيق؟",
      "contact.ads.card.p": "راسلنا مع علامتك، الجمهور المستهدف (الولاية، الفئة)، التواريخ المفضلة، والمرئيات. نرد خلال يومي عمل بالأسعار والفترات المتاحة.",
      "contact.ads.btn": "راسل فريق الإعلانات ←",
      "contact.msg.eyebrow": "راسلنا",
      "contact.msg.h2": "أرسل رسالة",
      "contact.msg.p": "نرد خلال يومي عمل. للحجوزات المستعجلة، استخدم شات التطبيق.",
      "contact.form.name": "اسمك",
      "contact.form.namePh": "كريم بن علي",
      "contact.form.email": "البريد الإلكتروني",
      "contact.form.emailPh": "you@example.dz",
      "contact.form.subject": "الموضوع",
      "contact.form.subjectPh": "عمّ يدور موضوعك؟",
      "contact.form.msg": "الرسالة",
      "contact.form.msgPh": "أخبرنا بما يجول في بالك…",
      "contact.form.btn": "إرسال ←",

      "terms.title": "شروط الاستخدام — khedmaPro",
      "terms.desc": "القواعد التي تحفظ عدالة khedmaPro للجميع.",
      "terms.eyebrow": "شروط الاستخدام",
      "terms.h1": "شروط الاستخدام.",
      "terms.updated": "آخر تحديث: جوان 2026",
      "terms.s1.h": "1. نظرة عامة",
      "terms.s1.p": "khedmaPro سوق يربط العملاء بمزوّدي خدمات مستقلّين. لا نقدّم الخدمات بأنفسنا — نيسّر الاتصال والاكتشاف والحجز والدردشة والتقييمات.",
      "terms.s2.h": "2. الحسابات",
      "terms.s2.p": "يجب أن يكون عمرك 18 عامًا فأكثر. يجب على المزوّدين تقديم معلومات دقيقة وبطاقة هوية سارية وامتثال القانون المحلي.",
      "terms.s3.h": "3. الدفع والعمولة",
      "terms.s3.p": "يدفع المزوّدون اشتراكًا شهريًا ثابتًا 1000 دج (بعد التجربة المجانية 90 يومًا). تكون مدفوعات الحجز مباشرة بين العميل والمزوّد ما لم تُدمج عبر Chargily Pay. لا يأخذ khedmaPro نسبة على قيمة العمل.",
      "terms.s4.h": "4. التقييمات والبلاغات",
      "terms.s4.p": "لا يُسمح بترك تقييم إلا للعملاء الذين أكملوا الحجز. قد يتم الإبلاغ التلقائي عن المزوّدين ذوي معدل الشكاوى المرتفع أو السلوك الاحتيالي، أو تعطيلهم.",
      "terms.s5.h": "5. الإلغاء والاسترداد",
      "terms.s5.p": "يمكن للطرفين الإلغاء قبل التأكيد. بعد التأكيد، يُدار الإلغاء مباشرة. الاستردادات — إن وُجدت — على مسؤولية المزوّد.",
      "terms.s6.h": "6. الاتصال",
      "terms.s6.p": "لأي سؤال حول هذه الشروط، راسلنا على support@khedmapro.dz.",

      "priv.title": "سياسة الخصوصية — khedmaPro",
      "priv.desc": "كيف يتعامل khedmaPro مع بياناتك الشخصية وأرقام الهاتف والموقع.",
      "priv.eyebrow": "سياسة الخصوصية",
      "priv.h1": "سياسة الخصوصية.",
      "priv.updated": "آخر تحديث: جوان 2026",
      "priv.s1.h": "1. ما نجمعه",
      "priv.s1.p": "المعلومات التي تقدّمها عند إنشاء الحساب (الاسم، البريد، الهاتف)، ولايتك/مدينتك، فئة الخدمة، صور البورتفوليو، وبإذنك — موقع GPS للبحث حسب الشعاع.",
      "priv.s2.h": "2. ما لا نبيعه",
      "priv.s2.p": "لا نبيع بياناتك الشخصية لأي طرف ثالث. أبدًا.",
      "priv.s3.h": "3. خصوصية الهاتف",
      "priv.s3.p": "تبقى أرقام العملاء والمزوّدين مخفية من نتائج البحث العامة والملفات الشخصية. تظهر للطرف الآخر فقط بعد تأكيد الحجز من الطرفين — ويُسجّل كل كشف.",
      "priv.s4.h": "4. بيانات الموقع",
      "priv.s4.p": "تُستخدم إحداثيات GPS فقط لحساب المسافة من موقع البحث. لا نخزّن سجل مواقع دقيق. إن رفضت الإذن، يتم الاعتماد على التصفية على مستوى الولاية.",
      "priv.s5.h": "5. مستندات التوثيق",
      "priv.s5.p": "يرفع المزوّدون بطاقة الهوية + الشهادات الاختيارية. تُخزَّن مشفَّرة، ويطّلع عليها الإداريّون فقط، ولا تُعرض على العملاء.",
      "priv.s6.h": "6. حذف البيانات",
      "priv.s6.p": "يمكنك تعطيل حسابك في أي وقت. الحذف الكامل ممكن عبر طلب على support@khedmapro.dz — نحذف البيانات الشخصية خلال 30 يومًا.",
      "priv.s7.h": "7. الاتصال",
      "priv.s7.p": "لأسئلة الخصوصية، راسلنا على support@khedmapro.dz.",
    },
  };

  function tr(lang, key) {
    return (dict[lang] && dict[lang][key]) || dict.en[key] || "";
  }

  function apply(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

    // Body text nodes
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var v = tr(lang, key);
      if (v) el.textContent = v;
    });

    // Placeholders
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var v = tr(lang, el.getAttribute("data-i18n-ph"));
      if (v) el.setAttribute("placeholder", v);
    });

    // <title> / <meta description>
    var titleKey = document.documentElement.getAttribute("data-i18n-title");
    if (titleKey) {
      var tv = tr(lang, titleKey);
      if (tv) document.title = tv;
    }
    var descKey = document.documentElement.getAttribute("data-i18n-desc");
    if (descKey) {
      var dv = tr(lang, descKey);
      var meta = document.querySelector('meta[name="description"]');
      if (meta && dv) meta.setAttribute("content", dv);
    }

    // Update selector display value
    var sel = document.getElementById("site-lang-select");
    if (sel && sel.value !== lang) sel.value = lang;

    // Overlay admin-configured hero/contact if we've already fetched it.
    applyAdminOverrides(lang);
  }

  // ----- Admin overrides (hero text, contact info) + social icons -----
  var _remoteCfg = null;   // { social:{...}, site:{...} }

  function applyAdminOverrides(lang) {
    if (!_remoteCfg) return;
    var site = _remoteCfg.site || {};
    // Hero title: overlay onto the composed h1 (data-i18n=home.h1a/h1b/h1c) —
    // when the admin sets a title, we blow the three spans away and inject one
    // clean line so operators can freely rewrite the copy per language.
    var titleKey = "hero_title_" + lang;
    var subKey = "hero_sub_" + lang;
    var newTitle = site[titleKey];
    var newSub = site[subKey];
    if (newTitle) {
      var h1a = document.querySelector('[data-i18n="home.h1a"]');
      var h1b = document.querySelector('[data-i18n="home.h1b"]');
      var h1c = document.querySelector('[data-i18n="home.h1c"]');
      if (h1a && h1b && h1c) {
        var h1 = h1a.closest("h1");
        if (h1) {
          h1.innerHTML = '';
          var span = document.createElement("span");
          span.className = "grad";
          span.textContent = newTitle;
          h1.appendChild(span);
        }
      }
    }
    if (newSub) {
      var lede = document.querySelector('[data-i18n="home.lede"]');
      if (lede) lede.textContent = newSub;
    }

    // Contact section (only on contact.html) — replace hard-coded emails/phones.
    // Any element with class `js-contact-email`, `js-contact-phone`, `js-contact-whatsapp`
    // gets populated with the admin's values (if set).
    if (site.contact_email) {
      document.querySelectorAll(".js-contact-email").forEach(function (el) {
        el.textContent = site.contact_email;
        if (el.tagName === "A") el.setAttribute("href", "mailto:" + site.contact_email);
      });
    }
    // Phone tile: hide the parent .info-tile if no phone configured.
    document.querySelectorAll(".js-contact-phone").forEach(function (el) {
      var tile = el.closest(".info-tile");
      if (!site.contact_phone) {
        if (tile) tile.style.display = "none";
        return;
      }
      el.textContent = site.contact_phone;
      if (el.tagName === "A") el.setAttribute("href", "tel:" + site.contact_phone.replace(/\s+/g, ""));
      if (tile) tile.style.display = "";
    });
    // WhatsApp tile: same treatment.
    document.querySelectorAll(".js-contact-whatsapp").forEach(function (el) {
      var tile = el.closest(".info-tile");
      if (!site.contact_whatsapp) {
        if (tile) tile.style.display = "none";
        return;
      }
      el.textContent = site.contact_whatsapp;
      if (el.tagName === "A") el.setAttribute("href", site.contact_whatsapp);
      if (tile) tile.style.display = "";
    });

    // ---- Section visibility toggles ----
    // Each toggle defaults to true if not explicitly false.
    var toggle = function (id, show) {
      var el = document.getElementById(id);
      if (el) el.style.display = show === false ? "none" : "";
    };
    toggle("sec-features", site.show_features);
    toggle("sec-stats", site.show_stats);
    toggle("sec-final-cta", site.show_final_cta);
    toggle("sec-testimonials", site.show_testimonials);

    // ---- Feature blurbs override ----
    // Admin passes an array of up to 6 {title_XX, desc_XX} objects. We map them
    // 1:1 onto the six `data-i18n="home.fN.t"` / `home.fN.p` cards.
    if (Array.isArray(site.features) && site.features.length > 0) {
      site.features.slice(0, 6).forEach(function (feat, idx) {
        var i = idx + 1;
        var t = feat["title_" + lang] || feat.title_en || "";
        var d = feat["desc_" + lang] || feat.desc_en || "";
        if (t) {
          var tEl = document.querySelector('[data-i18n="home.f' + i + '.t"]');
          if (tEl) tEl.textContent = t;
        }
        if (d) {
          var dEl = document.querySelector('[data-i18n="home.f' + i + '.p"]');
          if (dEl) dEl.textContent = d;
        }
      });
    }

    // ---- Footer tagline override ----
    var ft = site["footer_tagline_" + lang];
    if (ft) {
      document.querySelectorAll('[data-i18n="footer.tagline"]').forEach(function (el) {
        el.textContent = ft;
      });
    }

    // ---- Advertise CTA block (contact.html) ----
    var ah = site["advertise_h2_" + lang];
    if (ah) {
      document.querySelectorAll('[data-i18n="contact.ads.h2"]').forEach(function (el) {
        el.textContent = ah;
      });
    }
    var ab = site["advertise_body_" + lang];
    if (ab) {
      document.querySelectorAll('[data-i18n="contact.ads.p"]').forEach(function (el) {
        el.textContent = ab;
      });
    }

    // ---- Nav labels + pricing block overrides ----
    // Map admin keys to i18n keys used across the site.
    var overrides = [
      { site: "nav_how_" + lang, i18n: "nav.how" },
      { site: "nav_providers_" + lang, i18n: "nav.providers" },
      { site: "nav_contact_" + lang, i18n: "nav.contact" },
      { site: "nav_open_" + lang, i18n: "nav.open" },
      { site: "pricing_h2_" + lang, i18n: "prov.pricing.h2" },
      { site: "pricing_body_" + lang, i18n: "prov.pricing.p" },
      { site: "pricing_period_" + lang, i18n: "prov.plan.active.priceSub" },
    ];
    overrides.forEach(function (o) {
      var v = site[o.site];
      if (!v) return;
      document.querySelectorAll('[data-i18n="' + o.i18n + '"]').forEach(function (el) {
        el.textContent = v;
      });
    });
    // Language-neutral amount ("1000 DA", "1500 DA", "20 EUR" — whatever the admin sets).
    if (site.pricing_amount) {
      document.querySelectorAll('[data-i18n="prov.plan.active.price"]').forEach(function (el) {
        el.textContent = site.pricing_amount;
      });
    }

    // ---- Testimonials section (injected dynamically) ----
    var testimonials = Array.isArray(site.testimonials) ? site.testimonials : [];
    var testiSec = document.getElementById("sec-testimonials");
    if (testiSec) {
      // If the admin turned it off explicitly, our earlier toggle already hid it.
      // Only populate if we have items AND the toggle is not false.
      var host = testiSec.querySelector(".testimonials-grid");
      if (host) {
        host.innerHTML = "";
        if (testimonials.length === 0) {
          testiSec.style.display = "none";
        } else if (site.show_testimonials !== false) {
          testiSec.style.display = "";
          testimonials.forEach(function (t) {
            var quote = t["quote_" + lang] || t.quote_en || "";
            if (!quote) return;
            var card = document.createElement("div");
            card.className = "card testimonial-card";
            var q = document.createElement("p");
            q.className = "testimonial-quote";
            q.textContent = "\u201C" + quote + "\u201D";
            card.appendChild(q);
            var footer = document.createElement("div");
            footer.className = "testimonial-footer";
            if (t.avatar_url) {
              var img = document.createElement("img");
              img.src = t.avatar_url;
              img.alt = t.name || "";
              img.className = "testimonial-avatar";
              footer.appendChild(img);
            }
            var meta = document.createElement("div");
            meta.className = "testimonial-meta";
            if (t.name) {
              var n = document.createElement("div");
              n.className = "testimonial-name";
              n.textContent = t.name;
              meta.appendChild(n);
            }
            if (t.role) {
              var r = document.createElement("div");
              r.className = "testimonial-role";
              r.textContent = t.role;
              meta.appendChild(r);
            }
            footer.appendChild(meta);
            card.appendChild(footer);
            host.appendChild(card);
          });
        }
      }
    }

    // Social icons — inject into any element with id="site-social".
    var social = _remoteCfg.social || {};
    var container = document.getElementById("site-social");
    if (container) {
      // Clear so re-applying doesn't stack icons.
      container.innerHTML = "";
      [
        { url: social.facebook_url, label: "Facebook", svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.563V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.99 22 12z"/></svg>' },
        { url: social.instagram_url, label: "Instagram", svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153a4.9 4.9 0 0 1 1.153 1.772c.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 0 1-1.153 1.772 4.915 4.915 0 0 1-1.772 1.153c-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 0 1-1.772-1.153 4.904 4.904 0 0 1-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 0 1 1.153-1.772A4.897 4.897 0 0 1 5.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6.5-.25a1.25 1.25 0 0 0-2.5 0 1.25 1.25 0 0 0 2.5 0zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>' },
        { url: social.tiktok_url, label: "TikTok", svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.35a8.16 8.16 0 0 0 4.77 1.52V6.42a4.85 4.85 0 0 1-1.84-.27z"/></svg>' },
      ].forEach(function (item) {
        if (!item.url) return;
        var a = document.createElement("a");
        a.href = item.url;
        a.setAttribute("aria-label", item.label);
        a.className = "social-icon";
        a.target = "_blank";
        a.rel = "noopener";
        a.innerHTML = item.svg;
        container.appendChild(a);
      });
    }
  }

  function fetchRemoteConfig() {
    // Same-origin fetch. `/api/public/settings` is unauthenticated.
    try {
      fetch("/api/public/settings", { credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          _remoteCfg = data;
          // Re-apply with current lang so overrides land immediately.
          var current = document.documentElement.lang || "en";
          applyAdminOverrides(current);
        })
        .catch(function () {});
    } catch (_) {}
  }

  function init() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    var initial = stored && dict[stored] ? stored : (navigator.language || "en").slice(0, 2);
    if (!dict[initial]) initial = "en";

    apply(initial);

    var sel = document.getElementById("site-lang-select");
    if (sel) {
      sel.value = initial;
      sel.addEventListener("change", function () {
        var v = sel.value;
        try { localStorage.setItem(STORAGE_KEY, v); } catch (_) {}
        apply(v);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); fetchRemoteConfig(); });
  } else {
    init();
    fetchRemoteConfig();
  }

  // Expose for debugging
  window.khedmaProI18n = { apply: apply, dict: dict, LANGS: LANGS };
})();
