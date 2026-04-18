import { motion, type Variants } from "framer-motion";
import { ArrowLeft, Terminal } from "lucide-react";
import { Link } from "react-router-dom";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export default function ErrorPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 select-none font-sans antialiased text-white overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 max-w-xl w-full"
      >
        <motion.div
          variants={itemVariants}
          className="flex items-center gap-3 mb-12"
        >
          <div className="h-px flex-1 bg-zinc-900" />
          <span className="text-[10px] font-mono tracking-[0.4em] text-zinc-600 uppercase">
            Not Found 404
          </span>
          <div className="h-px flex-1 bg-zinc-900" />
        </motion.div>

        <div className="space-y-8 text-center">
          <motion.h1
            variants={itemVariants}
            className="text-7xl md:text-9xl font-bold tracking-tighter leading-none"
          >
            LOST IN <br />
            <span className="text-zinc-800">TRANSIT</span>
          </motion.h1>

          <motion.div variants={itemVariants} className="flex justify-center">
            <div className="px-4 py-2 rounded-sm border border-zinc-800 bg-zinc-950/50 backdrop-blur-md flex items-center gap-2.5">
              <Terminal className="h-3.5 w-3.5 text-zinc-600" />
              <p className="text-[11px] font-mono text-zinc-500">
                SYSTEM_HALT:{" "}
                <span className="text-zinc-300">ROUTE_UNDEFINED</span>
              </p>
            </div>
          </motion.div>

          <motion.p
            variants={itemVariants}
            className="text-zinc-500 text-sm md:text-base max-w-70 md:max-w-xs mx-auto leading-relaxed font-mono"
          >
            The requested session has timed out or the path is restricted.
          </motion.p>
        </div>

        <motion.div
          variants={itemVariants}
          className="mt-16 flex justify-center"
        >
          <Link to="/">
            <button className="rounded-2xl cursor-pointer group relative flex items-center justify-center px-12 py-4 bg-white text-black overflow-hidden transition-all duration-300 active:scale-95 border border-white">
              <div className="relative z-20 flex items-center gap-2 font-bold tracking-widest text-[10px] uppercase transition-colors duration-300 group-hover:text-white">
                <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-1" />
                <span>Return to Base</span>
              </div>

              <div className="absolute inset-0 z-10 bg-black translate-y-[101%] group-hover:translate-y-0 transition-transform duration-[400px] ease-[0.16,1,0.3,1]" />

              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ring-1 ring-white/50" />
            </button>
          </Link>
        </motion.div>
      </motion.div>

      <div className="fixed top-12 left-12 w-6 h-6 border-t border-l border-zinc-900 pointer-events-none" />
      <div className="fixed bottom-12 right-12 w-6 h-6 border-b border-r border-zinc-900 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="fixed bottom-10 flex items-center gap-4 text-zinc-800"
      ></motion.div>
    </div>
  );
}
