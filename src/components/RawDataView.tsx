import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

interface RawDataExport {
  id: string;
  source: string;
  timestamp: string;
  organization: string;
  metrics: any;
  granularData: any;
}

const RawDataView = () => {
  const [data, setData] = useState<RawDataExport[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'raw_data_exports'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RawDataExport));
      setData(docs);
    });
    return unsubscribe;
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-8"
    >
      <h2 className="text-2xl font-bold font-display text-inera-neutral-10">Rådata från API</h2>
      <div className="space-y-4">
        <AnimatePresence>
          {data.map(item => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="card p-4 shadow-sm border border-inera-secondary-90 rounded-lg bg-white"
            >
              <div className="flex justify-between text-xs text-inera-neutral-40 mb-2">
                <span>Källa: {item.source}</span>
                <span>Tid: {new Date(item.timestamp).toLocaleString()}</span>
              </div>
              <pre className="text-xs font-mono bg-inera-secondary-95 p-2 rounded overflow-x-auto">
                {JSON.stringify({ metrics: item.metrics, granularData: item.granularData }, null, 2)}
              </pre>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default RawDataView;
