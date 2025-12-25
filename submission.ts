interface Patient {
    patient_id: string;
    name: string;
    age: number | string;
    gender: string;
    blood_pressure: string;
    temperature: number | string;
    visit_date: string;
    diagnosis: string;
    medications: string;
}

interface ApiResponse {
    data: Patient[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
    };
}

const API_BASE_URL = "https://assessment.ksensetech.com/api/patients";
const SUBMISSION_URL = "https://assessment.ksensetech.com/api/submit-assessment";
const API_KEY = "ak_86e6955e82d044571ba9bebd8e10802aaea9ce900a073f25"; 


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getAllPatients(): Promise<Patient[]> {
    let allPatients: Patient[] = [];
    let page = 1;
    let hasNext = true;


    while (hasNext) {
        const res = await fetch(`${API_BASE_URL}?page=${page}&limit=5`, {
            headers: {
                "x-api-key": API_KEY
            }
        });


        if (!res.ok) {
            console.error(`API Error: `);
        }

        const json = (await res.json()) as any;
        const pageData = json.data || json.patients;

        if (!pageData) {
            console.error("Unexpected JSON structure:Error");
        }

        allPatients.push(...pageData);

        hasNext = json.pagination?.hasNext ?? false;

        page++;

        await sleep(1000);
    }

    return allPatients;
}

function normalizeBP(bp: string): string {
    if (!bp) return "";
    return bp.trim().toUpperCase().replace(/\s+/g, "");
}

function extractBP(bp: string): { sys: number | null; dia: number | null } {
    const cleaned = normalizeBP(bp);

    const match = /^(\d{2,3})\/(\d{2,3})$/.exec(cleaned);
    if (!match) return { sys: null, dia: null };

    return {
        sys: parseInt(match[1]),
        dia: parseInt(match[2])
    };
}

function normalizeTemp(temp: any): number {
    const t = Number(temp);
    return isNaN(t) ? NaN : t;
}

function normalizeAge(age: any): number {
    const a = Number(age);
    return isNaN(a) ? NaN : a;
}

function scoreBP(bp: string): number {
    const { sys, dia } = extractBP(bp);
    if (sys === null || dia === null) return 0;

    if (sys < 120 && dia < 80) return 0;
    if (sys >= 120 && sys <= 129 && dia < 80) return 1;
    if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) return 2;
    if (sys >= 140 || dia >= 90) return 3;

    return 0;
}

function scoreTemp(temp: any): number {
    const t = normalizeTemp(temp);
    if (isNaN(t)) return 0;

    if (t <= 99.5) return 0;
    if (t >= 99.6 && t <= 100.9) return 1;
    if (t >= 101.0) return 2;

    return 0;
}

function scoreAge(age: any): number {
    const a = normalizeAge(age);
    if (isNaN(a)) return 0;

    if (a < 40) return 0;
    if (a >= 40 && a <= 65) return 1;
    if (a > 65) return 2;

    return 0;
}

function isDataQualityIssue(bp: string): boolean {
    const { sys, dia } = extractBP(bp);
    return sys === null || dia === null;
}

function analyzePatients(patients: Patient[]) {
    const results = {
        high_risk_patients: [] as string[],
        fever_patients: [] as string[],
        data_quality_issues: [] as string[],
    };

    patients.forEach((p) => {
        const bpScore = scoreBP(p.blood_pressure);
        const tempScore = scoreTemp(p.temperature);
        const ageScore = scoreAge(p.age);

        const totalRisk = bpScore + tempScore + ageScore;


        if (totalRisk >= 3) {
            results.high_risk_patients.push(p.patient_id);
        }

        if (normalizeTemp(p.temperature) >= 99.6) {
            results.fever_patients.push(p.patient_id);
        }

        if (isDataQualityIssue(p.blood_pressure)) {
            results.data_quality_issues.push(p.patient_id);
        }
    });

    return results;
}


async function run() {
    const patients = await getAllPatients();
    const results = analyzePatients(patients);


    const response = await fetch(SUBMISSION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(results),
    });
  
    const data = await response.json();
    console.log(data);
}

run();