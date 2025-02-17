import { motion } from 'framer-motion';

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      {/* Container with a subtle gradient and shadow */}
      <div className="rounded-xl p-8 flex flex-col gap-6 leading-relaxed text-center max-w-xl bg-gradient-to-br from-gray-50 to-white shadow-lg">
        {/* Title with a gradient text effect */}
        <h1 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
          Meet Sunya Sidekick
        </h1>
        {/* Subtitle in a contrasting color */}
        <h2 className="text-lg text-gray-700 font-semibold">
          The relentless intern for all things energy, from renewables to oil and gas.
        </h2>
        {/* Body text */}
        <p className="text-base text-gray-600">
          Drop in some details and let it work its magic.
        </p>
        {/* “Heads up” note with slight emphasis */}
        <p className="text-sm text-gray-500">
          Heads up:{' '}
          <span className="font-medium text-gray-700">
            It might be slow and off-target sometimes, but it&apos;s still a solid first pass.
          </span>
        </p>
      </div>
    </motion.div>
  );
};
