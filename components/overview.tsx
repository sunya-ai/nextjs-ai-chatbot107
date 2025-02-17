import { motion } from 'framer-motion';

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20 px-4"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div
        className="
          max-w-xl mx-auto 
          rounded-xl p-8 
          flex flex-col gap-6 
          leading-relaxed text-center 
          bg-white dark:bg-gray-900
          border border-gray-200 dark:border-gray-800
          shadow-lg hover:shadow-xl transition-shadow
        "
      >
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
          Sunya Sidekick
        </h1>

        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          The relentless intern for all things energy, from renewables to oil and gas.
        </h2>

        <p className="text-base text-gray-900 dark:text-gray-100">
          Drop in some details and let it work its magic.
        </p>

        <p className="text-sm text-gray-900 dark:text-gray-100">
          <span className="font-medium">Heads up:</span> It might be slow and off-target sometimes, 
          but it&apos;s still a solid first pass.
        </p>
      </div>
    </motion.div>
  );
};
