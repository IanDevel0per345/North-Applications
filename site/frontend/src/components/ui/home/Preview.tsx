"use client";

import { motion } from "framer-motion";

export function Preview() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: 2, duration: 0.2, ease: "easeOut" }}
      className="relative z-20 flex items-center justify-center w-full self-center overflow-hidden"
    >
      <div className="min-w-full max-w-full md:max-w-5xl lg:max-w-6xl self-center flex">
        <div
          className="rounded-2xl h-150 shadow-2xl bg-background border border-white/10"
          style={{ transform: "perspective(500px) rotateX(20deg)" }}
        >
          <img
            src="preview.png"
            alt="Preview"
            className="w-full h-[90%] md:h-auto aspect-video select-none object-cover rounded-2xl"
            draggable={false}
          />
        </div>
      </div>
    </motion.section>
  );
}


