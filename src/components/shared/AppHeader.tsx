import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import logo from "@/assets/LOGO.png";
import { useTranslation } from "react-i18next";

export const AppHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { isSuperAdmin, isOrgAdmin, organization } = useOrg();
  const { t } = useTranslation();

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const navItems = [
    { label: "Chat", path: "/chat" },
    { label: t("nav.settings"), path: "/settings" },
  ];

  // Add admin link for super_admin
  if (isSuperAdmin) {
    navItems.push({ label: "Admin", path: "/admin" });
  }

  return (
    <header className="bg-white sticky top-0 z-50 relative">
      <div className="container mx-auto px-8 md:px-12">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/chat")}
              className="focus:outline-none transition-opacity hover:opacity-80"
            >
              <img src={logo} alt="FLAIX Ads Media" className="h-12" />
            </button>
            {organization && (
              <span className="text-xs font-light text-gray-400 bg-gray-50 px-2 py-1 rounded">
                {organization.name}
              </span>
            )}
          </div>

          <nav className="flex items-center gap-8">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`
                  text-sm font-light tracking-wide
                  transition-all duration-300
                  relative
                  group
                  ${location.pathname === item.path || location.pathname.startsWith(item.path + '/')
                    ? "bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] bg-clip-text text-transparent font-normal"
                    : "text-gray-700"
                  }
                `}
              >
                <span className="relative">
                  {item.label}
                  <span className="absolute inset-0 bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0] bg-clip-text text-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {item.label}
                  </span>
                </span>
              </button>
            ))}

            <span className="text-gray-300">|</span>

            <button
              onClick={handleLogout}
              className="
                text-sm font-light tracking-wide
                text-gray-700
                transition-all duration-300
                relative
                group
                hover:text-red-500
              "
            >
              {t('nav.logout')}
            </button>
          </nav>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0]"></div>
    </header>
  );
};
