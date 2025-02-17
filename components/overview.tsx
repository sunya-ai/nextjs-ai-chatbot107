"use client"

import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

const contentVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: custom * 0.1,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
}

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20 px-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div
        className="
          relative
          max-w-xl mx-auto 
          rounded-3xl p-6 
          flex flex-col gap-4 
          leading-relaxed text-center 
          bg-gradient-to-br from-[#454b1b]/80 to-[#1a365d]/80
          shadow-lg hover:shadow-xl transition-all duration-300
          overflow-hidden backdrop-blur-xl
          border border-white/10
        "
      >
        <div className="absolute inset-0 bg-grid-white/[0.02] [mask-image:linear-gradient(0deg,transparent,black)]" />

        <motion.div
          className="absolute top-4 right-4 p-2 bg-white/10 rounded-full"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          <Sparkles className="w-5 h-5 text-white" />
        </motion.div>

        <motion.h2 className="text-3xl font-bold text-white" variants={contentVariants} custom={0}>
          Sunya Sidekick
        </motion.h2>

        <motion.h3 className="text-base font-medium text-white/90" variants={contentVariants} custom={1}>
          The relentless intern for all things energy, from renewables to oil and gas.
        </motion.h3>

        <motion.p className="text-sm text-white/80" variants={contentVariants} custom={2}>
          Drop in some details and let it work its magic.
        </motion.p>

        <motion.p className="text-xs text-white/70" variants={contentVariants} custom={3}>
          <span className="font-medium">Heads up:</span> It might be slow and off-target sometimes, but it&apos;s still
          a solid first pass.
        </motion.p>
      </div>
    </motion.div>
  )
}

