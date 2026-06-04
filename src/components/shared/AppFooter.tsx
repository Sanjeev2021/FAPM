import { Link } from "react-router-dom";

export const AppFooter = () => {
  return (
    <footer className="bg-white mt-auto">
      <div className="h-[1px] bg-gradient-to-r from-[#7C8CF8] via-[#C084FC] to-[#F59AC0]"></div>

      <div className="container mx-auto px-8 md:px-12 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs font-light text-gray-500">
            © 2026 FLAIX. Tous droits réservés.
          </p>
          <div className="flex items-center gap-6">
            <Link
              to="/contact"
              className="text-xs font-light text-gray-500 hover:text-[#7C8CF8] transition-colors"
            >
              Contact
            </Link>
            <Link
              to="/legal?tab=cgv"
              className="text-xs font-light text-gray-500 hover:text-[#7C8CF8] transition-colors"
            >
              CGV
            </Link>
            <Link
              to="/legal?tab=mentions"
              className="text-xs font-light text-gray-500 hover:text-[#7C8CF8] transition-colors"
            >
              Mentions légales
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
