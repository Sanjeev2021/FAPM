import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppFooter } from "@/components/shared/AppFooter";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/LOGO.png";
import { Mail } from "lucide-react";

export default function Contact() {
  const { toast } = useToast();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", company: "", message: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: "Message envoyé", description: "Nous vous répondons sous 24h." });
    setForm({ firstName: "", lastName: "", email: "", company: "", message: "" });
  };

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
        <p className="text-xs font-bold uppercase tracking-widest text-[#7C8CF8] mb-4">Nous contacter</p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-900 mb-3">Parlons de votre projet.</h1>
        <p className="text-base text-gray-500 leading-relaxed mb-10 max-w-lg">
          Une démo, une question, un partenariat — notre équipe vous répond sous 24h.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-10">
          <div className="bg-white rounded-xl border border-gray-100 p-7">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Planifier une démo</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              Voyez Léo en action sur un brief réel. 20 minutes, ROI visible immédiatement.
            </p>
            <a href="mailto:maxime@flaix.ai" className="inline-flex items-center gap-2 text-sm font-medium text-[#7C8CF8] hover:underline">
              <Mail className="h-4 w-4" /> maxime@flaix.ai
            </a>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-7">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Contact général</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              Questions, partenariats, presse — toutes les demandes sont les bienvenues.
            </p>
            <a href="mailto:contact@flaix.ai" className="inline-flex items-center gap-2 text-sm font-medium text-[#7C8CF8] hover:underline">
              <Mail className="h-4 w-4" /> contact@flaix.ai
            </a>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-8 max-w-xl">
          <h2 className="text-base font-semibold text-gray-900 mb-6">Envoyer un message</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-600">Prénom</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Maxime" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-600">Nom</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Tallet" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-600">Email professionnel</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="vous@entreprise.com" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-600">Société</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Nom de votre entreprise" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-600">Message</Label>
              <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Décrivez votre projet, votre contexte, vos questions..." rows={4} required />
            </div>
            <Button type="submit" variant="primary" className="h-11">
              <span className="w-2 h-2 bg-emerald-400 rounded-full" />
              Envoyer le message
            </Button>
          </form>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
