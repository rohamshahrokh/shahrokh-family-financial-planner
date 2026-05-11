import jsPDF from "jspdf";
console.log("typeof default:", typeof jsPDF);
// Probe what the import binding actually is:
console.log("constructor name:", (jsPDF as any)?.name);
try {
  const doc = new (jsPDF as any)({ unit: "pt", format: "a4" });
  console.log("OK new() works", typeof doc.output === "function");
} catch (e:any) { console.log("ERR new():", e.message); }

// Try named import too
import * as ns from "jspdf";
console.log("ns keys:", Object.keys(ns).slice(0,8));
console.log("ns.jsPDF:", typeof (ns as any).jsPDF);
console.log("ns.default:", typeof (ns as any).default);

try {
  const cls = (ns as any).jsPDF ?? (ns as any).default ?? ns;
  const doc = new cls({ unit: "pt", format: "a4" });
  console.log("Fallback OK:", typeof doc.output === "function");
} catch (e:any) { console.log("Fallback ERR:", e.message); }
