import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppFooter } from "@/components/shared/AppFooter";
import logo from "@/assets/LOGO.png";
import { Link } from "react-router-dom";

export default function Legal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "mentions";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100">
        <div className="container mx-auto px-8 md:px-12">
          <nav className="flex justify-between items-center h-16">
            <Link to="/"><img src={logo} alt="Flaix" className="h-10" /></Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-4xl px-8 md:px-12 py-12">
        <Tabs
          value={activeTab}
          onValueChange={(tab) => setSearchParams({ tab })}
        >
          <TabsList className="mb-8">
            <TabsTrigger value="mentions">Mentions légales</TabsTrigger>
            <TabsTrigger value="cgv">CGV</TabsTrigger>
          </TabsList>

          <TabsContent value="mentions">
            <div className="bg-white rounded-xl border border-gray-100 p-8 space-y-8">
              <h1 className="text-2xl font-semibold text-gray-900">Mentions légales</h1>

              <div className="bg-gray-50 rounded-lg p-6 space-y-2 text-sm text-gray-700">
                <p><strong>FLAIX</strong> — EURL au capital de 1 000 €</p>
                <p>SIRET : 94461172200017</p>
                <p>TVA intracommunautaire : FR63944611722</p>
                <p>Siège social : 1, rue de Stockholm, 75008 Paris</p>
                <p>Gérant : Maxime Tallet</p>
                <p>Email : <a href="mailto:contact@flaix.ai" className="text-[#7C8CF8] hover:underline">contact@flaix.ai</a></p>
                <p>Hébergeur : Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA</p>
              </div>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Propriété intellectuelle</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  L'ensemble du contenu de ce site (textes, images, logiciels, bases de données, marques, logos) est la propriété exclusive de FLAIX ou de ses partenaires. Toute reproduction, représentation ou diffusion, même partielle, est interdite sans autorisation écrite préalable.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Données personnelles (RGPD)</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  FLAIX collecte et traite des données personnelles dans le cadre de la fourniture de ses services, conformément au Règlement Général sur la Protection des Données (RGPD). Vous disposez d'un droit d'accès, de rectification, de suppression et de portabilité de vos données. Pour exercer ces droits, contactez : <a href="mailto:contact@flaix.ai" className="text-[#7C8CF8] hover:underline">contact@flaix.ai</a>.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Cookies</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Ce site utilise des cookies strictement nécessaires au fonctionnement du service (authentification, préférences linguistiques). Aucun cookie publicitaire ou de traçage n'est utilisé.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Responsabilité</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  FLAIX s'efforce d'assurer l'exactitude des informations publiées sur ce site mais ne peut garantir leur exhaustivité. FLAIX ne saurait être tenue responsable des dommages directs ou indirects résultant de l'utilisation du site.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Droit applicable</h2>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Les présentes mentions légales sont régies par le droit français. Tout litige sera soumis à la compétence exclusive des tribunaux de Paris.
                </p>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="cgv">
            <div className="bg-white rounded-xl border border-gray-100 p-8 space-y-8">
              <h1 className="text-2xl font-semibold text-gray-900">Conditions Générales de Vente</h1>

              {[
                { title: "Article 1 — Objet", content: "Les présentes CGV régissent les conditions de fourniture de la plateforme FLAIX et de ses services associés (recommandations IA, génération de livrables, intégration de données)." },
                { title: "Article 2 — Services", content: "FLAIX propose un service SaaS comprenant : (i) une phase de setup (intégration de données, configuration, formation) et (ii) un accès récurrent à la plateforme (agent IA Léo, génération de livrables, stockage)." },
                { title: "Article 3 — Packs", content: "FLAIX propose différents packs adaptés au volume d'utilisation (nombre d'utilisateurs, volume de données, nombre de générations mensuelles). Le détail des packs est disponible sur demande." },
                { title: "Article 4 — Conditions financières", content: "Les tarifs sont communiqués sur devis. Les factures sont payables à 30 jours date de facture. Tout retard de paiement entraîne des pénalités de retard au taux légal en vigueur, majoré de 10 points, ainsi qu'une indemnité forfaitaire de 40€ pour frais de recouvrement." },
                { title: "Article 5 — Durée", content: "Le contrat est conclu pour une durée initiale de 12 mois, renouvelable tacitement par périodes de 12 mois. Chaque partie peut résilier avec un préavis de 3 mois avant la date anniversaire." },
                { title: "Article 6 — Niveau de service (SLA)", content: "FLAIX s'engage sur un taux de disponibilité de 99,5% calculé sur une base mensuelle (hors maintenance programmée). En cas de non-respect, un avoir sera accordé au prorata du temps d'indisponibilité." },
                { title: "Article 7 — Propriété intellectuelle", content: "La plateforme FLAIX, ses algorithmes, modèles et interfaces restent la propriété exclusive de FLAIX. Le client conserve la pleine propriété de ses données. Les livrables générés sont la propriété du client." },
                { title: "Article 8 — Protection des données (RGPD)", content: "FLAIX agit en qualité de sous-traitant au sens du RGPD. Les données clients sont hébergées en Europe (AWS eu-central-1). FLAIX s'engage à mettre en œuvre les mesures techniques et organisationnelles nécessaires à la sécurité des données." },
                { title: "Article 9 — IA et LLM", content: "Les recommandations générées par Léo sont des propositions d'aide à la décision. FLAIX ne garantit pas l'exhaustivité ou la pertinence absolue des recommandations IA. L'utilisateur reste seul décisionnaire de leur utilisation commerciale." },
                { title: "Article 10 — Responsabilité", content: "La responsabilité de FLAIX est limitée au montant total payé par le client au cours des 12 derniers mois. FLAIX ne saurait être tenue responsable des dommages indirects (perte de chiffre d'affaires, perte de données, préjudice d'image)." },
                { title: "Article 11 — Résiliation", content: "En cas de manquement grave d'une partie à ses obligations, l'autre partie pourra résilier le contrat de plein droit après mise en demeure restée sans effet pendant 30 jours." },
                { title: "Article 12 — Confidentialité", content: "Chaque partie s'engage à traiter comme confidentielles toutes les informations reçues de l'autre partie dans le cadre du contrat, pendant toute la durée du contrat et 2 ans après sa cessation." },
                { title: "Article 13 — Références commerciales", content: "Sauf opposition écrite du client, FLAIX pourra mentionner le nom et le logo du client dans ses références commerciales et supports de communication." },
                { title: "Article 14 — Hiérarchie des documents", content: "En cas de contradiction entre les documents contractuels, l'ordre de prévalence est : (1) Conditions particulières, (2) Annexes techniques, (3) Présentes CGV." },
                { title: "Article 15 — Juridiction", content: "Les présentes CGV sont régies par le droit français. Tout litige sera soumis à la compétence exclusive du Tribunal de Commerce de Paris." },
              ].map((article, i) => (
                <section key={i} className="space-y-2">
                  <h2 className="text-base font-semibold text-gray-900">{article.title}</h2>
                  <p className="text-sm text-gray-600 leading-relaxed">{article.content}</p>
                </section>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <AppFooter />
    </div>
  );
}
