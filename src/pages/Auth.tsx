import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate, useSearchParams } from "react-router-dom";
import logo from "@/assets/LOGO.png";
import gradientBg from "@/assets/FOND A copy.png";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { AppFooter } from "@/components/shared/AppFooter";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const urlCode = searchParams.get("code") || "";
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    joinCode: urlCode,
  });

  // Look up org name when join code changes
  useEffect(() => {
    const code = formData.joinCode.trim();
    if (code.length < 6) {
      setOrgName(null);
      return;
    }

    const timeout = setTimeout(async () => {
      const { data, error } = await supabase.rpc('lookup_org_by_code', {
        p_join_code: code,
      });

      if (!error && data?.found) {
        setOrgName(data.name);
      } else {
        setOrgName(null);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [formData.joinCode]);

  useEffect(() => {
    if (user) navigate("/chat");
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await signUp(
          formData.email,
          formData.password,
          formData.name,
          formData.joinCode.trim()
        );

        if (error) {
          toast({
            title: t("auth.errors.signupTitle"),
            description: error.message || t("auth.errors.signupDesc"),
            variant: "destructive",
          });
        } else {
          toast({
            title: t("auth.success.signupTitle"),
            description: t("auth.success.signupDesc"),
          });
          navigate("/chat");
        }
      } else {
        const { error } = await signIn(formData.email, formData.password);

        if (error) {
          toast({
            title: t("auth.errors.loginTitle"),
            description: error.message || t("auth.errors.loginDesc"),
            variant: "destructive",
          });
        } else {
          toast({
            title: t("auth.success.loginTitle"),
            description: t("auth.success.loginDesc"),
          });
          navigate("/chat");
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast({
        title: t("auth.errors.genericTitle"),
        description: error?.message || t("auth.errors.genericDesc"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center bg-gray-50">
      {/* Background Gradient */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${gradientBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      />

      {/* Glassmorphism Overlay */}
      <div className="absolute inset-0 bg-gray-50/30 backdrop-blur-sm z-0" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4 flex-1 flex flex-col justify-center">
        <div className="flex items-center justify-between mb-6 gap-2">
          <button
            onClick={() => navigate("/")}
            className="group relative font-light px-4 h-9 rounded-lg text-sm tracking-wide bg-white transition-all hover:scale-[1.02] flex items-center gap-2"
          >
            <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] p-[1.5px]">
              <span className="flex h-full w-full items-center justify-center rounded-lg bg-white group-hover:bg-gray-50 transition-colors">
              </span>
            </span>
            <span className="relative z-10 flex items-center gap-2">
              <ArrowLeft className="h-4 w-4 bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] bg-clip-text text-transparent" style={{ WebkitTextFillColor: 'transparent', WebkitBackgroundClip: 'text' }} />
              <span className="bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] bg-clip-text text-transparent">
                {t("auth.back")}
              </span>
            </span>
          </button>

        </div>

        <Card className="bg-white/80 backdrop-blur-md shadow-card border-0">
          <CardHeader className="space-y-4 text-center">
            <img src={logo} alt="FLAIX Ads Media" className="h-12 mx-auto" />
            <CardTitle className="text-2xl font-light tracking-tight text-gray-900">
              {mode === "login" ? t("auth.login.title") : t("auth.signup.title")}
            </CardTitle>
            <CardDescription className="text-sm font-light text-gray-600 leading-relaxed">
              {mode === "login"
                ? t("auth.login.description")
                : t("auth.signup.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-light text-gray-700">{t("auth.fields.name")}</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="Jean Dupont"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="joinCode" className="text-sm font-light text-gray-700">
                      Code organisation
                    </Label>
                    <Input
                      id="joinCode"
                      name="joinCode"
                      placeholder="Ex: 5FB3E69F"
                      value={formData.joinCode}
                      onChange={handleInputChange}
                      className="uppercase tracking-widest font-mono"
                      required
                    />
                    {orgName && (
                      <p className="text-xs text-green-600 font-light">
                        Vous rejoindrez <strong>{orgName}</strong>
                      </p>
                    )}
                    {formData.joinCode.trim().length >= 6 && !orgName && (
                      <p className="text-xs text-red-500 font-light">
                        Code invalide
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-light text-gray-700">{t("auth.fields.email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="vous@exemple.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-light text-gray-700">{t("auth.fields.password")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full h-11"
                disabled={loading}
              >
                <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                {loading ? t("auth.buttons.loading") : mode === "login" ? t("auth.buttons.login") : t("auth.buttons.signup")}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm font-light text-gray-600">
              {mode === "login" ? (
                <p>
                  {t("auth.links.noAccount")}{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="text-[#7C8CF8] font-normal hover:underline"
                  >
                    {t("auth.links.createAccount")}
                  </button>
                </p>
              ) : (
                <p>
                  {t("auth.links.hasAccount")}{" "}
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-[#7C8CF8] font-normal hover:underline"
                  >
                    {t("auth.links.signIn")}
                  </button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative z-10 w-full">
        <AppFooter />
      </div>
    </div>
  );
};

export default Auth;
