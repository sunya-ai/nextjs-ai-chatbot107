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
      <div className="rounded-xl p-6 flex flex-col gap-6 leading-relaxed text-center max-w-xl">
        <p className="text-2xl font-bold">
          <span className="underline underline-offset-4">Meet Sunya Sidekick</span> — the relentless intern for all things energy, from renewables to oil and gas.
        </p>
        <p className="text-lg">
          Drop in some details and let it work its magic.
        </p>
        <p className="text-md">
          Heads up:{' '}
          <span className="font-medium">
            It might be slow and off-target sometimes, but it&apos;s still a solid first pass.
          </span>
        </p>
      </div>
    </motion.div>
  );
};
