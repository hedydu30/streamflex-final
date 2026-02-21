import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const footerLinks = [
  [
    { label: "Accueil", to: "/" },
    { label: "Vidéos", to: "/videos" },
    { label: "Modèles", to: "/models" },
    { label: "Ma Liste", to: "/my-list" },
  ],
  [
    { label: "Profil", to: "/profile" },
    { label: "Import", to: "/import" },
    { label: "Administration", to: "/admin" },
    { label: "Connexion", to: "/auth" },
  ],
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

const Footer = () => {
  return (
    <footer className="px-4 md:px-12 py-12 mt-12 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="grid grid-cols-2 gap-6 mb-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {footerLinks.map((col, i) => (
            <div key={i} className="flex flex-col gap-2">
              {col.map((item) => (
                <motion.div key={item.label} variants={itemVariants}>
                  <Link
                    to={item.to}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-block"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
            </div>
          ))}
        </motion.div>
        <motion.p
          className="text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          © 2026 StreamFlex
        </motion.p>
      </div>
    </footer>
  );
};

export default Footer;
