import React, { useState } from 'react';
import { Copy, Send } from 'lucide-react';
import { motion } from 'motion/react';

const ApiView = () => {
  const [jsonPayload, setJsonPayload] = useState(JSON.stringify({
    "source": "inera-sus",
    "metrics": {
      "score": 81.5,
      "evaluationsCount": 112,
      "responseRate": 72
    }
  }, null, 2));

  const [response, setResponse] = useState('');

  const handleTestApi = async () => {
    try {
      const res = await fetch('/api/sync-metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-token': 'inera_ux_token_11am0nao'
        },
        body: jsonPayload
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setResponse(JSON.stringify({ error: 'Failed to call API' }, null, 2));
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-8"
    >
      <div className="card p-6 shadow-md border-inera-secondary-90">
        <h2 className="text-xl font-bold font-display text-inera-neutral-10 mb-4">Dina API-Uppgifter</h2>
        <p className="text-sm text-inera-neutral-40 mb-4">Använd dessa uppgifter i källkoden eller webhookinställningarna för dina externa mät-appar.</p>
        
        <div className="mb-4">
          <label className="block text-xs font-bold text-inera-neutral-40 mb-1">SYNC API ENDPOINT (POST)</label>
          <div className="flex gap-2">
            <input readOnly value="https://ais-dev-l76l36yeflupiu7m7lvblm-168492443119.europe-west1.run.app/api/sync-metrics" className="flex-grow p-2 border border-inera-secondary-90 rounded text-sm bg-inera-secondary-95" />
            <button className="p-2 border border-inera-secondary-90 rounded bg-white hover:bg-inera-secondary-95"><Copy size={16} /></button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-inera-neutral-40 mb-1">X-API-TOKEN (HEADER)</label>
          <div className="flex gap-2">
            <input readOnly value="inera_ux_token_11am0nao" className="flex-grow p-2 border border-inera-secondary-90 rounded text-sm bg-inera-secondary-95" />
            <button className="p-2 border border-inera-secondary-90 rounded bg-white hover:bg-inera-secondary-95"><Copy size={16} /></button>
          </div>
        </div>
      </div>

      <div className="card p-6 shadow-md border-inera-secondary-90">
        <h2 className="text-xl font-bold font-display text-inera-neutral-10 mb-4">Interaktiv API Testbänk (Sandbox)</h2>
        <p className="text-sm text-inera-neutral-40 mb-4">Välj en Presets-källa nedan, redigera JSON-kroppen direkt och skicka iväg anropet för att uppdatera databasen i realtid!</p>
        
        <div className="flex gap-2 mb-4">
            <button className="text-sm px-3 py-1 bg-inera-secondary-95 rounded-full hover:bg-inera-secondary-90 text-inera-neutral-20">UX-Mognad Presets</button>
            <button className="text-sm px-3 py-1 bg-inera-secondary-95 rounded-full hover:bg-inera-secondary-90 text-inera-neutral-20">Inera Kunskap Presets</button>
            <button className="text-sm px-3 py-1 bg-inera-primary-40 text-white rounded-full font-semibold">Inera SUS Presets</button>
            <button className="text-sm px-3 py-1 bg-inera-secondary-95 rounded-full hover:bg-inera-secondary-90 text-inera-neutral-20">Tillgänglighet Presets</button>
        </div>

        <textarea 
          value={jsonPayload}
          onChange={(e) => setJsonPayload(e.target.value)}
          className="w-full h-48 p-4 bg-inera-neutral-10 text-white font-mono text-sm rounded-lg mb-4"
        />

        <button onClick={handleTestApi} className="btn btn--m btn--primary">
          <Send size={16} /> Skicka API-anrop
        </button>

        {response && (
            <div className="mt-4 p-4 bg-inera-secondary-95 rounded text-sm font-mono text-inera-neutral-20">
                {response}
            </div>
        )}
      </div>
    </motion.div>
  );
};

export default ApiView;
