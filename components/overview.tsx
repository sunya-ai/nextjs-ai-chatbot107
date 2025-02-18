"use client"

import { motion } from "framer-motion"

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

export const Overview = () => {
  return (
    <motion.div
      className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="
          rounded-3xl p-6
          bg-gradient-to-br from-[#454b1b] to-[#1a365d]
          shadow-lg
          flex flex-col justify-end
          min-h-[180px]
        "
        variants={itemVariants}
      >
        <div className="flex flex-col space-y-2 max-w-2xl">
          <motion.h2 variants={itemVariants} className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Sunya Sidekick
          </motion.h2>

          <motion.h3 variants={itemVariants} className="text-sm sm:text-base font-medium text-white/90">
            The relentless intern for all things energy, from renewables to oil and gas.
          </motion.h3>

          <motion.p variants={itemVariants} className="text-xs text-white/70">
            <span className="font-medium">Heads up:</span> It might be slow and off-target sometimes, but it&apos;s
            still a solid first pass.
          </motion.p>
        </div>
      </motion.div>
    </motion.div>
  )
}

