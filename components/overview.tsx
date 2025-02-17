"use client"

import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

const containerVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      delay: 0.5,
      duration: 0.5,
      ease: "easeOut",
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: 0.3,
      ease: "easeIn",
    },
  },
}

const contentVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.7,
      duration: 0.5,
      ease: "easeOut",
    },
  },
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
          rounded-xl p-8 
          flex flex-col gap-6 
          leading-relaxed text-center 
          bg-gradient-to-br from-[#454b1b]/90 to-[#454b1b]/100
          shadow-lg hover:shadow-xl transition-all duration-300
          overflow-hidden
        "
      >
        <div className="absolute inset-0 bg-grid-white/[0.02] [mask-image:linear-gradient(0deg,transparent,black)]" />

        <motion.div
          className="absolute top-4 left-4 p-2 bg-white/10 rounded-full"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1, duration: 0.3 }}
        >
          <Sparkles className="w-5 h-5 text-white" />
        </motion.div>

        <motion.div className="relative z-10 space-y-6" variants={contentVariants}>
          <h1 className="text-3xl font-extrabold text-white">Sunya Sidekick</h1>

          <h2 className="text-lg font-semibold text-white">
            The relentless intern for all things energy, from renewables to oil and gas.
          </h2>

          <p className="text-base text-white">Drop in some details and let it work its magic.</p>

          <p className="text-sm text-white/80">
            <span className="font-medium">Heads up:</span> It might be slow and off-target sometimes, but it&apos;s
            still a solid first pass.
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}

