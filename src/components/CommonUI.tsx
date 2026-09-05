import React from 'react';
import { ArrowUpRight, ArrowDownRight, LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export interface HeaderNavItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}

export const HeaderNavItem: React.FC<HeaderNavItemProps> = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-3 py-1.5 text-sm font-bold transition-all border-b-2 whitespace-nowrap",
      active 
        ? "border-inera-primary-40 text-inera-primary-40" 
        : "border-transparent text-[#383d42] hover:text-inera-primary-40"
    )}
  >
    <Icon size={18} className={active ? "text-inera-primary-40" : "text-[#383d42]"} />
    <span>{label}</span>
  </button>
);

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
  trend?: number | null;
}

export const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, subValue, color, trend }) => (
  <div className="card p-6 shadow-sm flex items-start gap-4 border-inera-secondary-90">
    <div className={cn("p-3 rounded-lg", color)}>
      <Icon size={24} className="text-white" />
    </div>
    <div className="flex-1">
      <p className="text-sm text-inera-neutral-40 font-medium">{label}</p>
      <div className="flex items-baseline gap-2">
        <h3 className="text-2xl font-bold text-inera-neutral-10 mt-1">{value}</h3>
        {trend !== null && trend !== undefined && (
          <span className={cn(
            "text-xs font-bold flex items-center gap-0.5",
            trend > 0 ? "text-inera-success-40" : "text-inera-error-40"
          )}>
            {trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
      {subValue && <p className="text-xs text-inera-neutral-60 mt-1">{subValue}</p>}
    </div>
  </div>
);

export const SusLegend: React.FC = () => (
  <div className="card shadow-sm flex flex-wrap gap-6 items-center justify-between text-sm border-inera-secondary-90 py-3">
    <div className="flex flex-wrap gap-6 items-center">
      <span className="font-bold text-inera-neutral-20">SUS Betygsskala:</span>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-success-50"></span>≥ 80.3 (Utmärkt)</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-info-50"></span>68 - 80.2 (Bra)</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-attention-50"></span>51 - 67.9 (Godkänd)</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-inera-error-50"></span>&lt; 51 (Underkänd)</div>
    </div>
  </div>
);
