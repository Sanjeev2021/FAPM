import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Calendar, Quote } from "lucide-react";
import logo from "@/assets/LOGO.png";
import gradientBg from "@/assets/FOND A copy.png";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AppFooter } from "@/components/shared/AppFooter";
import { useTranslation } from "react-i18next";

const Landing = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showDemoDialog, setShowDemoDialog] = useState(false);
  const [demoForm, setDemoForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: ""
  });

  return (
    <div className="min-h-screen bg-gray-50 overflow-hidden">
      {/* ─── Header / Nav ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white relative">
        <div className="container mx-auto px-8 md:px-12">
          <nav className="flex justify-between items-center h-20">
            <img src={logo} alt="Flaix" className="h-12" />
            <div className="flex items-center gap-4">
              <button
                className="group relative font-light px-6 h-9 rounded-lg text-sm tracking-wide bg-transparent transition-all hover:scale-[1.02]"
                onClick={() => navigate("/auth?mode=login")}
              >
                <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] p-[1.5px]">
                  <span className="flex h-full w-full items-center justify-center rounded-lg bg-white group-hover:bg-gray-50 transition-colors" />
                </span>
                <span className="relative z-10 bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] bg-clip-text text-transparent">
                  {t("landing.nav.login")}
                </span>
              </button>
              <Button variant="primary" className="px-6 h-9" onClick={() => navigate("/auth?mode=signup")}>
                <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                {t("landing.nav.signup")}
              </Button>
            </div>
          </nav>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0]" />
      </header>

      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <img src={gradientBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      </div>

      {/* ─── Hero ─── */}
      <section className="relative pt-32 pb-12 px-8 md:px-12">
        <div className="container mx-auto max-w-5xl text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gray-200 bg-white/80 text-xs text-gray-500">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            {t("landing.hero.badge")}
          </div>

          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.08] tracking-tight text-gray-900">
            {t("landing.hero.title")}
            <br />
            {t("landing.hero.subtitle")}
            <br />
            <span className="bg-gradient-to-r from-[#7C8CF8] via-[#A78BFA] to-[#F59AC0] bg-clip-text text-transparent">
              {t("landing.hero.tagline2")}
            </span>
          </h1>

          <p className="text-base md:text-lg font-light text-gray-600 leading-relaxed max-w-2xl mx-auto">
            {t("landing.hero.description")}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-4">
            <Button variant="primary" size="lg" className="px-8 h-11 hover:scale-[1.02]" onClick={() => setShowDemoDialog(true)}>
              <span className="w-2 h-2 bg-emerald-400 rounded-full" />
              {t("landing.hero.cta")}
            </Button>
            <button className="group relative font-light px-8 h-11 rounded-lg text-sm tracking-wide bg-transparent transition-all hover:scale-[1.02]">
              <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] p-[1.5px]">
                <span className="flex h-full w-full items-center justify-center rounded-lg bg-white group-hover:bg-gray-50 transition-colors" />
              </span>
              <span className="relative z-10 bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] bg-clip-text text-transparent">
                {t("landing.hero.demo")}
              </span>
            </button>
          </div>

          <p className="text-xs font-light text-gray-500">{t("landing.hero.socialProof")}</p>
        </div>
      </section>

      {/* ─── Stats Bar ─── */}
      <section className="relative px-8 md:px-12 pb-16">
        <div className="container mx-auto max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-3 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {[
              { num: t("landing.stats.speed"), label: t("landing.stats.speedLabel") },
              { num: t("landing.stats.time"), label: t("landing.stats.timeLabel") },
              { num: t("landing.stats.errors"), label: t("landing.stats.errorsLabel") },
            ].map((stat, i) => (
              <div key={i} className="text-center py-8 px-6 border-b md:border-b-0 md:border-r last:border-r-0 last:border-b-0 border-gray-100">
                <div className="text-4xl font-semibold tracking-tight text-gray-900">{stat.num}</div>
                <div className="text-sm text-gray-500 mt-2">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Power Section + Metrics ─── */}
      <section className="relative py-20 px-8 md:px-12">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-[#7C8CF8] mb-4">{t("landing.power.eyebrow")}</p>
            <h2 className="text-3xl md:text-4xl font-semibold leading-tight tracking-tight text-gray-900 mb-4">
              {t("landing.power.title")}
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-base text-gray-600 leading-relaxed">
              {t("landing.power.description")}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {[
              { num: t("landing.metrics.velocity"), title: t("landing.metrics.velocityTitle"), desc: t("landing.metrics.velocityDesc"), color: "text-[#7C8CF8]" },
              { num: t("landing.metrics.production"), title: t("landing.metrics.productionTitle"), desc: t("landing.metrics.productionDesc"), color: "text-red-400" },
              { num: t("landing.metrics.data"), title: t("landing.metrics.dataTitle"), desc: t("landing.metrics.dataDesc"), color: "text-emerald-500" },
              { num: t("landing.metrics.roi"), title: t("landing.metrics.roiTitle"), desc: t("landing.metrics.roiDesc"), color: "text-amber-500" },
            ].map((m, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-6">
                <div className={`text-3xl font-bold tracking-tight mb-1 ${m.color}`}>{m.num}</div>
                <div className="text-sm font-semibold text-gray-900 mb-1">{m.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="relative py-20 px-8 md:px-12 bg-gradient-to-b from-white to-gray-50">
        <div className="container mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-[#7C8CF8] mb-4">{t("landing.howItWorks.eyebrow")}</p>
          <h2 className="text-3xl md:text-4xl font-semibold leading-tight tracking-tight text-gray-900 mb-4">
            {t("landing.howItWorks.title")}
          </h2>
          <p className="text-base text-gray-600 leading-relaxed max-w-2xl mb-10">
            {t("landing.howItWorks.description")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {[
              { step: "01", title: t("landing.howItWorks.step1Title"), desc: t("landing.howItWorks.step1Desc") },
              { step: "02", title: t("landing.howItWorks.step2Title"), desc: t("landing.howItWorks.step2Desc") },
              { step: "03", title: t("landing.howItWorks.step3Title"), desc: t("landing.howItWorks.step3Desc") },
              { step: "04", title: t("landing.howItWorks.step4Title"), desc: t("landing.howItWorks.step4Desc") },
            ].map((s, i) => (
              <div key={i} className="p-7 border-b md:border-b-0 md:border-r last:border-r-0 last:border-b-0 border-gray-100">
                <div className="text-xs font-bold text-[#7C8CF8] mb-3">{s.step}</div>
                <div className="text-sm font-semibold text-gray-900 mb-2">{s.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Quote Block ─── */}
      <section className="relative py-12 px-8 md:px-12">
        <div className="container mx-auto max-w-4xl">
          <div className="border-l-4 border-[#7C8CF8] pl-8 py-4">
            <p className="text-lg text-gray-500 leading-relaxed italic mb-3">{t("landing.quote.text")}</p>
            <p className="text-sm text-gray-400">{t("landing.quote.cite")}</p>
          </div>
        </div>
      </section>

      {/* ─── Outputs Grid ─── */}
      <section className="relative py-20 px-8 md:px-12">
        <div className="container mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-[#7C8CF8] mb-4">{t("landing.outputs.eyebrow")}</p>
          <h2 className="text-3xl md:text-4xl font-semibold leading-tight tracking-tight text-gray-900 mb-4">
            {t("landing.outputs.title")}
          </h2>
          <p className="text-base text-gray-600 leading-relaxed max-w-2xl mb-10">{t("landing.outputs.description")}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {[
              t("landing.outputs.item1"), t("landing.outputs.item2"), t("landing.outputs.item3"),
              t("landing.outputs.item4"), t("landing.outputs.item5"), t("landing.outputs.item6"),
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-5 border-b md:border-r border-gray-100 last:border-r-0 [&:nth-child(3n)]:md:border-r-0 [&:nth-last-child(-n+3)]:md:border-b-0 last:border-b-0">
                <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                <span className="text-sm text-gray-600">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonial ─── */}
      <section className="relative py-12 px-8 md:px-12">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <Quote className="h-6 w-6 text-[#7C8CF8] mb-4" strokeWidth={1.5} />
            <p className="text-lg text-gray-500 leading-relaxed italic mb-6">{t("landing.testimonial.text")}</p>
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-[#7C8CF8]">AL</div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{t("landing.testimonial.name")}</div>
                <div className="text-xs text-gray-500">{t("landing.testimonial.title")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Board ─── */}
      <section className="relative py-20 px-8 md:px-12">
        <div className="container mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-[#7C8CF8] mb-4">{t("landing.board.eyebrow")}</p>
          <h2 className="text-3xl md:text-4xl font-semibold leading-tight tracking-tight text-gray-900 mb-4">
            {t("landing.board.title")}
          </h2>
          <p className="text-base text-gray-600 leading-relaxed max-w-2xl mb-10">{t("landing.board.description")}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { initials: "MT", name: t("landing.board.member1Name"), role: t("landing.board.member1Role"), org: t("landing.board.member1Org"), tag: t("landing.board.member1Tag"), bgColor: "bg-gray-100", textColor: "text-[#7C8CF8]" },
              { initials: "M", name: t("landing.board.member2Name"), role: t("landing.board.member2Role"), org: t("landing.board.member2Org"), tag: t("landing.board.member2Tag"), bgColor: "bg-blue-50", textColor: "text-blue-600" },
              { initials: "AL", name: t("landing.board.member3Name"), role: t("landing.board.member3Role"), org: t("landing.board.member3Org"), tag: t("landing.board.member3Tag"), bgColor: "bg-emerald-50", textColor: "text-emerald-600" },
              { initials: "MC", name: t("landing.board.member4Name"), role: t("landing.board.member4Role"), org: t("landing.board.member4Org"), tag: t("landing.board.member4Tag"), bgColor: "bg-amber-50", textColor: "text-amber-600" },
            ].map((member, i) => (
              <div key={i} className="flex items-start gap-4 bg-white rounded-xl border border-gray-100 p-6">
                <div className={`w-12 h-12 rounded-full ${member.bgColor} flex items-center justify-center text-sm font-semibold ${member.textColor} flex-shrink-0`}>
                  {member.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{member.name}</div>
                  <div className="text-xs text-[#7C8CF8] font-medium">{member.role}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{member.org}</div>
                  <span className="inline-block mt-2 px-3 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{member.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Client Pills ─── */}
      <section className="relative pb-16 px-8 md:px-12">
        <div className="container mx-auto max-w-4xl flex flex-wrap gap-3 justify-center">
          {[t("landing.clients.pill1"), t("landing.clients.pill2"), t("landing.clients.pill3")].map((pill, i) => (
            <span key={i} className="px-6 py-2.5 rounded-full border border-gray-200 text-sm font-medium text-gray-500">{pill}</span>
          ))}
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="relative py-24 px-8 md:px-12 border-t border-gray-100">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-semibold leading-tight tracking-tight text-gray-900 mb-4">
            {t("landing.cta.title")}
          </h2>
          <p className="text-base font-light text-gray-600 leading-relaxed mb-10 max-w-xl mx-auto">
            {t("landing.cta.description")}
          </p>
          <Button variant="primary" size="lg" className="px-10 h-12 hover:scale-[1.02]" onClick={() => setShowDemoDialog(true)}>
            <span className="w-2 h-2 bg-emerald-400 rounded-full" />
            {t("landing.cta.button")}
          </Button>
        </div>
      </section>

      <AppFooter />

      {/* ─── Demo Dialog ─── */}
      <Dialog open={showDemoDialog} onOpenChange={setShowDemoDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-light tracking-tight text-gray-900 flex items-center gap-2">
              <Calendar className="h-6 w-6 text-[#7C8CF8]" />
              {t("landing.demo.title")}
            </DialogTitle>
            <DialogDescription className="text-sm font-light text-gray-600 leading-relaxed">
              {t("landing.demo.description")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            toast({ title: t("landing.demo.success"), description: t("landing.demo.successDesc") });
            setShowDemoDialog(false);
            setDemoForm({ name: "", email: "", phone: "", company: "", message: "" });
          }} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="demo-name" className="text-sm font-light text-gray-700">{t("landing.demo.name")} *</Label>
              <Input id="demo-name" value={demoForm.name} onChange={(e) => setDemoForm({ ...demoForm, name: e.target.value })} placeholder="Jean Dupont" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-email" className="text-sm font-light text-gray-700">{t("landing.demo.email")} *</Label>
              <Input id="demo-email" type="email" value={demoForm.email} onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })} placeholder="jean.dupont@entreprise.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-phone" className="text-sm font-light text-gray-700">{t("landing.demo.phone")} *</Label>
              <Input id="demo-phone" type="tel" value={demoForm.phone} onChange={(e) => setDemoForm({ ...demoForm, phone: e.target.value })} placeholder="+33 6 12 34 56 78" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-company" className="text-sm font-light text-gray-700">{t("landing.demo.company")} *</Label>
              <Input id="demo-company" value={demoForm.company} onChange={(e) => setDemoForm({ ...demoForm, company: e.target.value })} placeholder="Nom de votre entreprise" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-message" className="text-sm font-light text-gray-700">{t("landing.demo.message")}</Label>
              <Textarea id="demo-message" value={demoForm.message} onChange={(e) => setDemoForm({ ...demoForm, message: e.target.value })} placeholder={t("landing.demo.messagePlaceholder")} rows={3} />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowDemoDialog(false)}>{t("landing.demo.cancel")}</Button>
              <Button type="submit" variant="primary" className="flex-1 h-11">
                <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                {t("landing.demo.submit")}
              </Button>
            </div>
          </form>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-light text-gray-500 text-center">{t("landing.demo.contact")}</p>
            <div className="flex flex-col gap-1 mt-2 text-center">
              <a href="mailto:maxime@flaix.ai" className="text-sm font-light text-[#7C8CF8] hover:underline">maxime@flaix.ai</a>
              <a href="tel:+33680741726" className="text-sm font-light text-[#7C8CF8] hover:underline">+33 6 80 74 17 26</a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Landing;
