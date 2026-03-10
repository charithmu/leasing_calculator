import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calculator, Percent, Car, Wallet, Info } from "lucide-react";

function toNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[’'\s_]/g, "").replace(/,/g, ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCHF(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function metricCard(title: string, value: string, subtitle?: string) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5">
        <div className="text-sm text-slate-500">{title}</div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
        {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
      </CardContent>
    </Card>
  );
}

function calcEffectiveFromNominal(nominalRate: number): number {
  const r = nominalRate / 100 / 12;
  return (Math.pow(1 + r, 12) - 1) * 100;
}

function calcNominalFromEffective(effectiveRate: number): number {
  const r = Math.pow(1 + effectiveRate / 100, 1 / 12) - 1;
  return r * 12 * 100;
}

function calcPayment(financedInclVat: number, residualInclVat: number, months: number, nominalRate: number): number {
  const r = nominalRate / 100 / 12;
  if (months <= 0) return NaN;
  if (Math.abs(r) < 1e-12) return (financedInclVat - residualInclVat) / months;
  return (financedInclVat - residualInclVat / Math.pow(1 + r, months)) * r / (1 - Math.pow(1 + r, -months));
}

type ResidualSolveResult =
  | {
      ok: true;
      residualInclVat: number;
      totalMonthlyPaymentsInclVat: number;
      depreciationPaidInclVat: number;
      interestPaid: number;
    }
  | {
      ok: false;
      message: string;
    };

type RateSolveResult =
  | {
      ok: true;
      nominalRate: number;
      effectiveRate: number;
      totalMonthlyPaymentsInclVat: number;
      depreciationPaidInclVat: number;
      interestPaid: number;
    }
  | {
      ok: false;
      message: string;
    };

function solveResidualFromPayment({
  financedInclVat,
  monthlyPaymentInclVat,
  months,
  nominalRate,
}: {
  financedInclVat: number;
  monthlyPaymentInclVat: number;
  months: number;
  nominalRate: number;
}): ResidualSolveResult {
  if (financedInclVat <= 0 || monthlyPaymentInclVat <= 0 || months <= 0) {
    return { ok: false, message: "Enter valid financed amount, monthly payment, and duration." };
  }

  const r = nominalRate / 100 / 12;
  let residualInclVat: number;

  if (Math.abs(r) < 1e-12) {
    residualInclVat = financedInclVat - monthlyPaymentInclVat * months;
  } else {
    residualInclVat =
      (financedInclVat - (monthlyPaymentInclVat * (1 - Math.pow(1 + r, -months))) / r) * Math.pow(1 + r, months);
  }

  const depreciationPaidInclVat = financedInclVat - residualInclVat;
  const totalMonthlyPaymentsInclVat = monthlyPaymentInclVat * months;
  const interestPaid = totalMonthlyPaymentsInclVat - depreciationPaidInclVat;

  return {
    ok: true,
    residualInclVat,
    totalMonthlyPaymentsInclVat,
    depreciationPaidInclVat,
    interestPaid,
  };
}

function solveRateFromResidual({
  financedInclVat,
  monthlyPaymentInclVat,
  residualInclVat,
  months,
}: {
  financedInclVat: number;
  monthlyPaymentInclVat: number;
  residualInclVat: number;
  months: number;
}): RateSolveResult {
  if (financedInclVat <= 0 || monthlyPaymentInclVat <= 0 || residualInclVat < 0 || months <= 0) {
    return { ok: false, message: "Enter valid financed amount, monthly payment, residual, and duration." };
  }

  const f = (ratePerMonth: number) => {
    if (Math.abs(ratePerMonth) < 1e-12) {
      return (financedInclVat - residualInclVat) / months - monthlyPaymentInclVat;
    }
    const pmt =
      (financedInclVat - residualInclVat / Math.pow(1 + ratePerMonth, months)) *
      ratePerMonth /
      (1 - Math.pow(1 + ratePerMonth, -months));
    return pmt - monthlyPaymentInclVat;
  };

  let low = 0;
  let high = 0.05;
  let fLow = f(low);
  let fHigh = f(high);

  for (let i = 0; i < 60 && fLow * fHigh > 0; i++) {
    high *= 1.5;
    fHigh = f(high);
  }

  if (fLow * fHigh > 0) {
    return { ok: false, message: "Could not solve the implied rate from these values." };
  }

  for (let i = 0; i < 120; i++) {
    const mid = (low + high) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < 1e-12) {
      low = high = mid;
      break;
    }
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }

  const monthlyRate = (low + high) / 2;
  const nominalRate = monthlyRate * 12 * 100;
  const effectiveRate = (Math.pow(1 + monthlyRate, 12) - 1) * 100;
  const totalMonthlyPaymentsInclVat = monthlyPaymentInclVat * months;
  const depreciationPaidInclVat = financedInclVat - residualInclVat;
  const interestPaid = totalMonthlyPaymentsInclVat - depreciationPaidInclVat;

  return {
    ok: true,
    nominalRate,
    effectiveRate,
    totalMonthlyPaymentsInclVat,
    depreciationPaidInclVat,
    interestPaid,
  };
}

export default function LeasingResidualCalculatorApp() {
  const [financedInclVat, setFinancedInclVat] = useState("23990");
  const [downPaymentInclVat, setDownPaymentInclVat] = useState("0");
  const [feesInclVat, setFeesInclVat] = useState("0");
  const [monthlyPaymentInclVat, setMonthlyPaymentInclVat] = useState("258.43");
  const [months, setMonths] = useState("36");
  const [nominalRate, setNominalRate] = useState("2.99");
  const [effectiveRate, setEffectiveRate] = useState("3.03");
  const [vatRate, setVatRate] = useState("8.1");
  const [residualExclVat, setResidualExclVat] = useState("15265.90");

  const parsed = {
    financedInclVat: toNumber(financedInclVat),
    downPaymentInclVat: toNumber(downPaymentInclVat),
    feesInclVat: toNumber(feesInclVat),
    monthlyPaymentInclVat: toNumber(monthlyPaymentInclVat),
    months: Math.round(toNumber(months)),
    nominalRate: toNumber(nominalRate),
    effectiveRate: toNumber(effectiveRate),
    vatRate: toNumber(vatRate),
    residualExclVat: toNumber(residualExclVat),
  };

  const grossFactor = 1 + parsed.vatRate / 100;
  const residualInclVatFromInput = parsed.residualExclVat * grossFactor;
  const financedNet = parsed.financedInclVat / grossFactor;
  const monthlyNet = parsed.monthlyPaymentInclVat / grossFactor;

  const residualSolved = useMemo(
    () =>
      solveResidualFromPayment({
        financedInclVat: parsed.financedInclVat,
        monthlyPaymentInclVat: parsed.monthlyPaymentInclVat,
        months: parsed.months,
        nominalRate: parsed.nominalRate,
      }),
    [parsed.financedInclVat, parsed.monthlyPaymentInclVat, parsed.months, parsed.nominalRate]
  );

  const aprSolved = useMemo(
    () =>
      solveRateFromResidual({
        financedInclVat: parsed.financedInclVat,
        monthlyPaymentInclVat: parsed.monthlyPaymentInclVat,
        residualInclVat: residualInclVatFromInput,
        months: parsed.months,
      }),
    [parsed.financedInclVat, parsed.monthlyPaymentInclVat, residualInclVatFromInput, parsed.months]
  );

  const paymentCheck = useMemo(() => {
    const predictedPaymentInclVat = calcPayment(
      parsed.financedInclVat,
      residualInclVatFromInput,
      parsed.months,
      parsed.nominalRate
    );
    const difference = predictedPaymentInclVat - parsed.monthlyPaymentInclVat;
    return { predictedPaymentInclVat, difference };
  }, [parsed.financedInclVat, residualInclVatFromInput, parsed.months, parsed.nominalRate, parsed.monthlyPaymentInclVat]);

  const loadAmagTest = () => {
    setFinancedInclVat("23990");
    setDownPaymentInclVat("0");
    setFeesInclVat("0");
    setMonthlyPaymentInclVat("258.43");
    setMonths("36");
    setNominalRate("2.99");
    setEffectiveRate("3.03");
    setVatRate("8.1");
    setResidualExclVat("15265.90");
  };

  const clearAll = () => {
    setFinancedInclVat("");
    setDownPaymentInclVat("0");
    setFeesInclVat("0");
    setMonthlyPaymentInclVat("");
    setMonths("");
    setNominalRate("");
    setEffectiveRate("");
    setVatRate("8.1");
    setResidualExclVat("");
  };

  const handleNominalChange = (value: string) => {
    setNominalRate(value);
    const num = toNumber(value);
    if (Number.isFinite(num)) setEffectiveRate(calcEffectiveFromNominal(num).toFixed(2));
  };

  const handleEffectiveChange = (value: string) => {
    setEffectiveRate(value);
    const num = toNumber(value);
    if (Number.isFinite(num)) setNominalRate(calcNominalFromEffective(num).toFixed(2));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3">
                  <Calculator className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Swiss Leasing Residual Calculator</CardTitle>
                  <CardDescription>
                    VAT-aware leasing math for AMAG-style screenshots. It shows residual values both excluding and including VAT.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label>Finanzierungsbetrag / financed amount (incl. VAT, CHF)</Label>
                  <Input value={financedInclVat} onChange={(e) => setFinancedInclVat(e.target.value)} placeholder="23990" />
                </div>
                <div className="space-y-2">
                  <Label>Monthly leasing rate (incl. VAT, CHF)</Label>
                  <Input value={monthlyPaymentInclVat} onChange={(e) => setMonthlyPaymentInclVat(e.target.value)} placeholder="258.43" />
                </div>
                <div className="space-y-2">
                  <Label>Duration (months)</Label>
                  <Input value={months} onChange={(e) => setMonths(e.target.value)} placeholder="36" />
                </div>
                <div className="space-y-2">
                  <Label>Down payment / Sonderzahlung (incl. VAT, CHF)</Label>
                  <Input value={downPaymentInclVat} onChange={(e) => setDownPaymentInclVat(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Fees rolled into financing (incl. VAT, CHF)</Label>
                  <Input value={feesInclVat} onChange={(e) => setFeesInclVat(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Nominal interest / Nominaler Zins (%)</Label>
                  <Input value={nominalRate} onChange={(e) => handleNominalChange(e.target.value)} placeholder="2.99" />
                </div>
                <div className="space-y-2">
                  <Label>Effective annual interest / Effektiver Jahreszins (%)</Label>
                  <Input value={effectiveRate} onChange={(e) => handleEffectiveChange(e.target.value)} placeholder="3.03" />
                </div>
                <div className="space-y-2">
                  <Label>VAT rate / MwSt. (%)</Label>
                  <Input value={vatRate} onChange={(e) => setVatRate(e.target.value)} placeholder="8.1" />
                </div>
                <div className="space-y-2">
                  <Label>Residual shown on screenshot (excl. VAT, CHF)</Label>
                  <Input value={residualExclVat} onChange={(e) => setResidualExclVat(e.target.value)} placeholder="15265.90" />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={loadAmagTest} variant="outline" className="rounded-2xl">Load AMAG test case</Button>
                <Button onClick={clearAll} variant="outline" className="rounded-2xl">Reset all fields</Button>
              </div>

              <Tabs defaultValue="residual" className="w-full">
                <TabsList className="grid w-full grid-cols-3 rounded-2xl">
                  <TabsTrigger value="residual">Residual from payment</TabsTrigger>
                  <TabsTrigger value="apr">Rate from residual</TabsTrigger>
                  <TabsTrigger value="check">Math check</TabsTrigger>
                </TabsList>

                <TabsContent value="residual" className="mt-6 space-y-6">
                  <Alert className="rounded-2xl">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Residual calculation with correct VAT handling</AlertTitle>
                    <AlertDescription>
                      The formula solves the internal balloon value on a gross basis, then also shows the corresponding residual excluding VAT.
                    </AlertDescription>
                  </Alert>

                  {residualSolved.ok ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {metricCard("Residual used in calculation (incl. VAT)", formatCHF(residualSolved.residualInclVat), "Gross balloon value")}
                        {metricCard("Residual excluding VAT", formatCHF(residualSolved.residualInclVat / grossFactor), "Customer-facing return value")}
                        {metricCard("Financed amount (incl. VAT)", formatCHF(parsed.financedInclVat), "Input gross financed amount")}
                        {metricCard("Financed amount (excl. VAT)", formatCHF(financedNet), "Net financed amount")}
                        {metricCard("Monthly leasing rate (incl. VAT)", formatCHF(parsed.monthlyPaymentInclVat), "Gross monthly payment")}
                        {metricCard("Monthly leasing rate (excl. VAT)", formatCHF(monthlyNet), "Net monthly payment")}
                        {metricCard("Total monthly payments (incl. VAT)", formatCHF(residualSolved.totalMonthlyPaymentsInclVat), `${parsed.months} × ${formatCHF(parsed.monthlyPaymentInclVat)}`)}
                        {metricCard("Depreciation paid during term (incl. VAT basis)", formatCHF(residualSolved.depreciationPaidInclVat), "Financed amount minus residual incl. VAT")}
                        {metricCard("Interest paid during lease (VAT-neutral)", formatCHF(residualSolved.interestPaid), "Monthly payments minus depreciation")}
                      </div>
                    </>
                  ) : (
                    <Alert variant="destructive" className="rounded-2xl">
                      <AlertTitle>Calculation not available</AlertTitle>
                      <AlertDescription>{residualSolved.message}</AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                <TabsContent value="apr" className="mt-6 space-y-6">
                  <Alert className="rounded-2xl">
                    <Percent className="h-4 w-4" />
                    <AlertTitle>Implied rate calculation</AlertTitle>
                    <AlertDescription>
                      This uses the residual excluding VAT from the screenshot, converts it to the gross internal residual, and solves the implied nominal and effective rates.
                    </AlertDescription>
                  </Alert>

                  {aprSolved.ok ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {metricCard("Residual from screenshot (excl. VAT)", formatCHF(parsed.residualExclVat), "Input residual")}
                      {metricCard("Residual used in calculation (incl. VAT)", formatCHF(residualInclVatFromInput), "Residual excl. VAT × (1 + VAT)")}
                      {metricCard("Implied nominal rate", formatPct(aprSolved.nominalRate), "Annual nominal rate")}
                      {metricCard("Implied effective annual rate", formatPct(aprSolved.effectiveRate), "Annual effective rate")}
                      {metricCard("Total monthly payments (incl. VAT)", formatCHF(aprSolved.totalMonthlyPaymentsInclVat), "Gross payment total")}
                      {metricCard("Interest paid during lease (VAT-neutral)", formatCHF(aprSolved.interestPaid), "Monthly payments minus depreciation")}
                    </div>
                  ) : (
                    <Alert variant="destructive" className="rounded-2xl">
                      <AlertTitle>Calculation not available</AlertTitle>
                      <AlertDescription>{aprSolved.message}</AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                <TabsContent value="check" className="mt-6 space-y-6">
                  <Alert className="rounded-2xl">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Direct AMAG-style verification</AlertTitle>
                    <AlertDescription>
                      Enter the screenshot values exactly. The app calculates the expected gross monthly payment from the gross financed amount, gross residual, nominal rate, and duration.
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {metricCard("Residual from screenshot (excl. VAT)", formatCHF(parsed.residualExclVat), "Net residual shown on document")}
                    {metricCard("Residual used in formula (incl. VAT)", formatCHF(residualInclVatFromInput), "Gross balloon value")}
                    {metricCard("Predicted monthly payment (incl. VAT)", formatCHF(paymentCheck.predictedPaymentInclVat), "Calculated from balloon formula")}
                    {metricCard("Actual entered monthly payment (incl. VAT)", formatCHF(parsed.monthlyPaymentInclVat), "Value from screenshot")}
                    {metricCard("Difference", formatCHF(paymentCheck.difference), "Small gap can come from system rounding")}
                    {metricCard("Effective annual rate from nominal", formatPct(calcEffectiveFromNominal(parsed.nominalRate)), "Cross-check of interest display")}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Car className="h-5 w-5" />
                  What to copy from a Swiss leasing screenshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <p>For AMAG-style calculations, use these values exactly as shown:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Finanzierungsbetrag inkl. MwSt.</li>
                  <li>Rücknahmewert exkl. MwSt.</li>
                  <li>Leasingrate pro Monat inkl. MwSt.</li>
                  <li>Laufzeit in Monaten</li>
                  <li>Nominaler Zins or Leasingzins</li>
                  <li>Effektiver Jahreszins for cross-checking</li>
                  <li>Sonderzahlung and bundled fees if present</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wallet className="h-5 w-5" />
                  Important math note
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                <p>
                  The residual shown on many Swiss leasing sheets is excluding VAT, while the financed amount and monthly leasing payment are including VAT.
                </p>
                <p>
                  That means the calculator must convert the residual to a gross value before using the balloon formula. If you do not do that, the residual and interest outputs will be wrong.
                </p>
                <p>
                  Tiny differences against the dealer sheet can still happen because of internal rounding or day-count rules, but the structure should now match the real system correctly.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
