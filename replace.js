const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = {
  'bg-blue-600': 'bg-inera-primary-40',
  'text-blue-600': 'text-inera-primary-40',
  'bg-blue-50': 'bg-inera-info-95',
  'text-blue-500': 'text-inera-primary-50',
  'text-blue-700': 'text-inera-primary-30',
  'text-blue-800': 'text-inera-primary-20',
  'text-blue-900': 'text-inera-primary-20',
  'border-blue-100': 'border-inera-info-95',
  'border-blue-200': 'border-inera-info-95',
  'border-blue-300': 'border-inera-primary-70',
  'border-blue-400': 'border-inera-primary-60',
  'ring-blue-500': 'ring-inera-primary-50',
  'bg-blue-100': 'bg-inera-primary-70',
  'shadow-blue-200': 'shadow-inera-primary-70',
  'bg-gray-50': 'bg-inera-secondary-95',
  'bg-gray-100': 'bg-inera-secondary-90',
  'bg-gray-200': 'bg-inera-neutral-90',
  'text-gray-200': 'text-inera-neutral-90',
  'text-gray-300': 'text-inera-neutral-70',
  'text-gray-400': 'text-inera-neutral-60',
  'text-gray-500': 'text-inera-neutral-40',
  'text-gray-600': 'text-inera-neutral-30',
  'text-gray-700': 'text-inera-neutral-20',
  'text-gray-800': 'text-inera-neutral-10',
  'text-gray-900': 'text-inera-neutral-10',
  'border-gray-100': 'border-inera-secondary-90',
  'border-gray-200': 'border-inera-neutral-90',
  'border-gray-300': 'border-inera-neutral-70',
  'bg-purple-600': 'bg-inera-accent-40',
  'text-purple-600': 'text-inera-accent-40',
  'bg-emerald-600': 'bg-inera-success-40',
  'text-emerald-600': 'text-inera-success-40',
  'bg-emerald-500': 'bg-inera-success-50',
  'bg-amber-600': 'bg-inera-attention-40',
  'text-green-600': 'text-inera-success-40',
  'bg-green-50': 'bg-inera-success-95',
  'text-green-700': 'text-inera-success-40',
  'text-red-600': 'text-inera-error-40',
  'bg-red-50': 'bg-inera-error-95',
  'text-red-700': 'text-inera-error-40',
  'bg-red-500': 'bg-inera-error-50',
  'bg-blue-500': 'bg-inera-info-50',
  'bg-yellow-500': 'bg-inera-attention-50',
  'text-blue-700': 'text-inera-primary-30',
  'text-yellow-700': 'text-inera-attention-40',
  'bg-yellow-50': 'bg-inera-attention-95',
  'border-yellow-200': 'border-inera-attention-40',
  'border-emerald-200': 'border-inera-success-40',
  'bg-emerald-50': 'bg-inera-success-95',
  'text-emerald-700': 'text-inera-success-40',
  'border-red-200': 'border-inera-error-40',
  '#2563eb': '#A33662',
  '#ef4444': '#D74F3D',
  '#f97316': '#DB901B',
  '#eab308': '#BD7100',
  '#3b82f6': '#489AEB',
  '#22c55e': '#40966D',
  '#9ca3af': '#7B848F',
  '#f0f0f0': '#EDF1F5',
  '#f9fafb': '#F9F6F1'
};

for (const [key, value] of Object.entries(replacements)) {
  content = content.split(key).join(value);
}

fs.writeFileSync(filePath, content);
console.log('Done');
