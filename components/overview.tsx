"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"

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
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
    }
  }, [])

  return (
    <motion.div
      className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="
          relative overflow-hidden
          rounded-3xl p-8 sm:p-12
          bg-gradient-to-br from-[#454b1b]/90 to-[#1a365d]/90
          shadow-2xl hover:shadow-3xl transition-all duration-300
          backdrop-blur-xl border border-white/10
          flex flex-col justify-end h-[300px] sm:h-[400px]
        "
        variants={itemVariants}
        style={{
          backgroundPosition: `calc(50% + ${mousePosition.x / 50}px) calc(50% + ${mousePosition.y / 50}px)`,
        }}
      >
        <div className="absolute inset-0 bg-grid-white/[0.02] [mask-image:linear-gradient(0deg,transparent,black)]" />

        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-blue-500/10 opacity-50"
          animate={{
            backgroundPosition: `${mousePosition.x / 10}px ${mousePosition.y / 10}px`,
          }}
          transition={{ type: "spring", damping: 10, stiffness: 50 }}
        />

        <div className="relative z-10 flex flex-col space-y-4 max-w-3xl">
          <motion.h2 variants={itemVariants} className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Sunya Sidekick
          </motion.h2>

          <motion.h3 variants={itemVariants} className="text-lg sm:text-xl font-medium text-white/90">
            The relentless intern for all things energy, from renewables to oil and gas.
          </motion.h3>

          <motion.p variants={itemVariants} className="text-xs sm:text-sm text-white/70 max-w-2xl">
            <span className="font-medium">Heads up:</span> It might be slow and off-target sometimes, but it&apos;s
            still a solid first pass.
          </motion.p>
        </div>
      </motion.div>
    </motion.div>
  )
}

