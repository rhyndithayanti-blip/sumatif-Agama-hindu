import { CONFIG } from '../config';
import { AnswerValue, ExamResult, ItemEvaluation, Question } from '../types';

/**
 * Normalisasi teks untuk pencocokan jawaban isian singkat dan opsi
 */
export function normalizeText(val: string): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Format durasi detik ke format mudah dibaca (contoh: "12m 08d")
 */
export function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null || isNaN(seconds) || seconds < 0) {
    return '-';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}d`;
  return `${mins}m ${String(secs).padStart(2, '0')}d`;
}

/**
 * Cek apakah siswa tuntas berdasarkan KKTP
 */
export function isResultTuntas(result: ExamResult): boolean {
  return Number(result.nilai) >= CONFIG.KKTP || result.status === 'Lulus';
}

/**
 * Evaluasi satu butir soal terhadap jawaban siswa
 */
export function evaluateSingleQuestion(
  question: Question,
  userAns: AnswerValue | undefined
): ItemEvaluation {
  const maxScore = question.weight > 0 ? question.weight : 1;

  if (userAns === undefined || userAns === null || userAns === '') {
    return {
      questionId: question.id,
      status: 'unanswered',
      score: 0,
      maxScore,
      studentAnswer: userAns,
    };
  }

  if (question.type === 'pg') {
    const correctOpt = question.options?.find((o) => o.id === question.correctAnswer);
    const ansStr = typeof userAns === 'string' ? userAns : '';
    const isMatch =
      !!correctOpt &&
      (ansStr === correctOpt.id ||
        normalizeText(ansStr) === normalizeText(correctOpt.text));

    return {
      questionId: question.id,
      status: isMatch ? 'correct' : 'wrong',
      score: isMatch ? maxScore : 0,
      maxScore,
      studentAnswer: userAns,
    };
  }

  if (question.type === 'pgk') {
    const correctKeys = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
    const correctTexts = (question.options || [])
      .filter((o) => correctKeys.includes(o.id))
      .map((o) => normalizeText(o.text));
    const userSelected = Array.isArray(userAns) ? userAns.map((x) => normalizeText(x)) : [];

    const matchedCount = userSelected.filter((u) => correctTexts.includes(u)).length;
    const hasWrong = userSelected.some((u) => !correctTexts.includes(u));

    if (!hasWrong && matchedCount === correctTexts.length && correctTexts.length > 0) {
      return {
        questionId: question.id,
        status: 'correct',
        score: maxScore,
        maxScore,
        studentAnswer: userAns,
      };
    }
    if (matchedCount > 0 && !hasWrong) {
      const partialScore = Math.round((maxScore * (matchedCount / correctTexts.length)) * 100) / 100;
      return {
        questionId: question.id,
        status: 'partial',
        score: partialScore,
        maxScore,
        studentAnswer: userAns,
      };
    }
    return {
      questionId: question.id,
      status: 'wrong',
      score: 0,
      maxScore,
      studentAnswer: userAns,
    };
  }

  if (question.type === 'pgk_kategori') {
    const statements = question.statements || [];
    const userMap =
      typeof userAns === 'object' && !Array.isArray(userAns)
        ? (userAns as Record<string, boolean>)
        : {};

    if (statements.length === 0) {
      return {
        questionId: question.id,
        status: 'wrong',
        score: 0,
        maxScore,
        studentAnswer: userAns,
      };
    }

    let statementsCorrect = 0;
    statements.forEach((st) => {
      if (userMap[st.id] === st.correctAnswer) {
        statementsCorrect += 1;
      }
    });

    if (statementsCorrect === statements.length) {
      return {
        questionId: question.id,
        status: 'correct',
        score: maxScore,
        maxScore,
        studentAnswer: userAns,
      };
    }
    if (statementsCorrect > 0) {
      const partialScore =
        Math.round((maxScore * (statementsCorrect / statements.length)) * 100) / 100;
      return {
        questionId: question.id,
        status: 'partial',
        score: partialScore,
        maxScore,
        studentAnswer: userAns,
      };
    }
    return {
      questionId: question.id,
      status: 'wrong',
      score: 0,
      maxScore,
      studentAnswer: userAns,
    };
  }

  if (question.type === 'isian') {
    const ansNorm = normalizeText(typeof userAns === 'string' ? userAns : '');
    if (!ansNorm) {
      return {
        questionId: question.id,
        status: 'unanswered',
        score: 0,
        maxScore,
        studentAnswer: userAns,
      };
    }
    const baseAnswer =
      typeof question.correctAnswer === 'string' ? question.correctAnswer : '';
    const acceptedList = [baseAnswer, ...(question.acceptedAnswers || [])]
      .filter(Boolean)
      .map(normalizeText);

    const isMatch = acceptedList.some((acc) => acc === ansNorm);
    return {
      questionId: question.id,
      status: isMatch ? 'correct' : 'wrong',
      score: isMatch ? maxScore : 0,
      maxScore,
      studentAnswer: userAns,
    };
  }

  return {
    questionId: question.id,
    status: 'wrong',
    score: 0,
    maxScore,
    studentAnswer: userAns,
  };
}

/**
 * Hitung keseluruhan hasil ujian siswa berdasarkan bank soal & jawaban per question.id
 */
export function evaluateExam(
  questions: Question[],
  answersByQuestionId: Record<number, AnswerValue>
) {
  let totalSkor = 0;
  let maxSkor = 0;
  let benar = 0;
  let benarSebagian = 0;
  let salah = 0;
  const itemEvaluations: Record<number, ItemEvaluation> = {};

  questions.forEach((q) => {
    const ev = evaluateSingleQuestion(q, answersByQuestionId[q.id]);
    itemEvaluations[q.id] = ev;
    totalSkor += ev.score;
    maxSkor += ev.maxScore;

    if (ev.status === 'correct') benar += 1;
    else if (ev.status === 'partial') benarSebagian += 1;
    else salah += 1;
  });

  totalSkor = Math.round(totalSkor * 100) / 100;
  const nilai = maxSkor > 0 ? Math.round((totalSkor / maxSkor) * 100) : 0;
  const status: 'Lulus' | 'Belum Lulus' = nilai >= CONFIG.KKTP ? 'Lulus' : 'Belum Lulus';

  return {
    totalSkor,
    maxSkor,
    benar,
    benarSebagian,
    salah,
    nilai,
    status,
    itemEvaluations,
  };
}

/**
 * Format jawaban siswa untuk ditampilkan secara manusiawi
 */
export function formatStudentAnswerDisplay(
  question: Question,
  userAns: AnswerValue | undefined
): string {
  if (userAns === undefined || userAns === null || userAns === '') {
    return '(Tidak dijawab)';
  }
  if (question.type === 'pg') {
    const str = String(userAns);
    const matchedOpt = question.options?.find(
      (o) => o.id === str || normalizeText(o.text) === normalizeText(str)
    );
    return matchedOpt ? `${matchedOpt.id}. ${matchedOpt.text}` : str;
  }
  if (question.type === 'pgk') {
    return Array.isArray(userAns) ? userAns.join('; ') : String(userAns);
  }
  if (question.type === 'pgk_kategori') {
    const map =
      typeof userAns === 'object' && !Array.isArray(userAns)
        ? (userAns as Record<string, boolean>)
        : {};
    return (question.statements || [])
      .map((st, idx) => `P${idx + 1}: ${map[st.id] === undefined ? '-' : map[st.id] ? 'Benar' : 'Salah'}`)
      .join(' | ');
  }
  return String(userAns);
}

/**
 * Format kunci jawaban soal secara manusiawi
 */
export function formatCorrectAnswerDisplay(question: Question): string {
  if (question.type === 'pg') {
    const opt = question.options?.find((o) => o.id === question.correctAnswer);
    return opt ? `${opt.id}. ${opt.text}` : String(question.correctAnswer || '');
  }
  if (question.type === 'pgk') {
    return Array.isArray(question.correctAnswer)
      ? question.correctAnswer.join(', ')
      : String(question.correctAnswer || '');
  }
  if (question.type === 'pgk_kategori') {
    return (question.statements || [])
      .map((st, idx) => `P${idx + 1}: ${st.correctAnswer ? 'Benar' : 'Salah'}`)
      .join(' | ');
  }
  return String(question.correctAnswer || '');
}

export interface TopicMastery {
  topic: string;
  questionCount: number;
  earnedScore: number;
  maxScore: number;
  percentage: number;
  isWeak: boolean;
  wrongQuestionIds: number[];
}

export interface WeakIndicator {
  questionId: number;
  topic: string;
  indicator: string;
  status: 'partial' | 'wrong' | 'unanswered';
}

export interface StudentAnalysis {
  hasDetail: boolean;
  itemEvaluations: Record<number, ItemEvaluation>;
  topicMastery: TopicMastery[];
  weakTopics: TopicMastery[];
  weakIndicators: WeakIndicator[];
  recommendations: string[];
  totalSkor: number;
  maxSkor: number;
}

const TOPIC_REMEDIAL_MAP: Record<string, string> = {
  'Hakikat Catur Paramitha':
    'Berikan pendampingan ulang tentang arti kata Catur (empat) dan Paramitha (budi pekerti luhur), urutan 4 bagian Catur Paramitha, serta kaitannya dengan ajaran Tat Twam Asi.',
  'Maitri (Persahabatan & Kasih Sayang)':
    'Latih siswa mempraktikkan sikap Maitri melalui cerita bergambar tentang berteman tanpa membeda-bedakan, menyambut teman baru, dan menyayangi sesama makhluk.',
  'Karuna (Belas Kasih & Tolong-Menolong)':
    'Berikan studi kasus sederhana mengenai tindakan menolong teman yang kesusahan secara tulus (Niskama Karma) dan kepedulian sosial terhadap sesama.',
  'Mudita (Simpati & Turut Berbahagia)':
    'Bimbing siswa membedakan sikap Mudita (turut senang atas keberhasilan teman) dengan sifat iri hati/Matsarya melalui permainan peran memberi ucapan selamat.',
  'Upeksa (Tenggang Rasa & Mawas Diri)':
    'Latih siswa memahami sikap tenggang rasa, menghargai perbedaan pendapat atau ibadah, bersikap adil, dan mawas diri saat menerima nasihat.',
};

/**
 * Analisis mendalam kelemahan indikator/topik dan rekomendasi remedial siswa tertentu
 */
export function analyzeStudentPerformance(
  questions: Question[],
  result: ExamResult
): StudentAnalysis {
  const detail = result.detailJawaban || {};
  const hasDetail = Object.keys(detail).length > 0;

  const itemEvaluations: Record<number, ItemEvaluation> = {};
  const topicBuckets: Record<
    string,
    { count: number; earned: number; max: number; wrongIds: number[] }
  > = {};
  const weakIndicators: WeakIndicator[] = [];

  let totalSkor = 0;
  let maxSkor = 0;

  questions.forEach((q) => {
    const ev = evaluateSingleQuestion(q, detail[q.id]);
    itemEvaluations[q.id] = ev;
    totalSkor += ev.score;
    maxSkor += ev.maxScore;

    if (!topicBuckets[q.topic]) {
      topicBuckets[q.topic] = { count: 0, earned: 0, max: 0, wrongIds: [] };
    }
    topicBuckets[q.topic].count += 1;
    topicBuckets[q.topic].earned += ev.score;
    topicBuckets[q.topic].max += ev.maxScore;
    if (ev.status !== 'correct') {
      topicBuckets[q.topic].wrongIds.push(q.id);
      if (hasDetail) {
        weakIndicators.push({
          questionId: q.id,
          topic: q.topic,
          indicator: q.indicator,
          status: ev.status,
        });
      }
    }
  });

  const topicMastery: TopicMastery[] = Object.entries(topicBuckets).map(
    ([topic, b]) => {
      const percentage = b.max > 0 ? Math.round((b.earned / b.max) * 100) : 0;
      return {
        topic,
        questionCount: b.count,
        earnedScore: Math.round(b.earned * 100) / 100,
        maxScore: b.max,
        percentage,
        isWeak: percentage < CONFIG.KKTP,
        wrongQuestionIds: b.wrongIds,
      };
    }
  );

  const weakTopics = topicMastery.filter((t) => t.isWeak);
  const recommendations: string[] = [];

  if (!hasDetail) {
    if (isResultTuntas(result)) {
      recommendations.push(
        `Siswa telah mencapai KKTP (${result.nilai} ≥ ${CONFIG.KKTP}). Berikan pengayaan berupa proyek membuat jurnal kebaikan harian penerapan Catur Paramitha (Maitri, Karuna, Mudita, Upeksa) di rumah dan sekolah.`
      );
    } else {
      recommendations.push(
        `Siswa belum mencapai KKTP (nilai < ${CONFIG.KKTP}). Lakukan pendampingan remedial ulang mengenai pengertian Catur Paramitha serta contoh penerapan Maitri, Karuna, Mudita, dan Upeksa.`
      );
    }
  } else {
    if (weakTopics.length > 0) {
      weakTopics.forEach((wt) => {
        const specificTip =
          TOPIC_REMEDIAL_MAP[wt.topic] ||
          `Lakukan pengulangan materi dan latihan soal bertahap pada topik ${wt.topic}.`;
        recommendations.push(
          `[${wt.topic} — Penguasaan ${wt.percentage}%]: ${specificTip} Fokuskan latihan pada butir soal nomor ${wt.wrongQuestionIds.join(', ')}.`
        );
      });
    } else {
      const lowestTopic = [...topicMastery].sort((a, b) => a.percentage - b.percentage)[0];
      recommendations.push(
        `Siswa sudah TUNTAS mencapai KKTP (${result.nilai} ≥ ${CONFIG.KKTP}). Berikan program pengayaan berupa cerita keteladanan tokoh Hindu dan refleksi penerapan Catur Paramitha dalam kehidupan bermasyarakat.`
      );
      if (lowestTopic && lowestTopic.percentage < 85) {
        recommendations.push(
          `Catatan penguatan ringan pada topik "${lowestTopic.topic}" (${lowestTopic.percentage}%) pada butir nomor ${lowestTopic.wrongQuestionIds.join(', ') || '-'} agar ketuntasan semakin optimal.`
        );
      }
    }
  }

  return {
    hasDetail,
    itemEvaluations,
    topicMastery,
    weakTopics,
    weakIndicators,
    recommendations,
    totalSkor: Math.round(totalSkor * 100) / 100,
    maxSkor,
  };
}

export interface ItemStat {
  question: Question;
  respondentsWithDetail: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  achievementPercent: number;
  empiricalDifficulty: 'Mudah' | 'Sedang' | 'Sukar' | '-';
}

/**
 * Hitung statistik empiris per butir soal dari seluruh hasil siswa yang memiliki detail jawaban
 */
export function computeItemStatistics(
  questions: Question[],
  results: ExamResult[]
): ItemStat[] {
  const resultsWithDetail = results.filter(
    (r) => r.detailJawaban && Object.keys(r.detailJawaban).length > 0
  );

  return questions.map((q) => {
    if (resultsWithDetail.length === 0) {
      return {
        question: q,
        respondentsWithDetail: 0,
        correctCount: 0,
        partialCount: 0,
        wrongCount: 0,
        achievementPercent: 0,
        empiricalDifficulty: '-',
      };
    }

    let correctCount = 0;
    let partialCount = 0;
    let wrongCount = 0;
    let sumScore = 0;
    let sumMax = 0;

    resultsWithDetail.forEach((r) => {
      const ev = evaluateSingleQuestion(q, r.detailJawaban?.[q.id]);
      sumScore += ev.score;
      sumMax += ev.maxScore;
      if (ev.status === 'correct') correctCount += 1;
      else if (ev.status === 'partial') partialCount += 1;
      else wrongCount += 1;
    });

    const achievementPercent = sumMax > 0 ? Math.round((sumScore / sumMax) * 100) : 0;
    let empiricalDifficulty: 'Mudah' | 'Sedang' | 'Sukar' = 'Sedang';
    if (achievementPercent > 70) empiricalDifficulty = 'Mudah';
    else if (achievementPercent < 30) empiricalDifficulty = 'Sukar';

    return {
      question: q,
      respondentsWithDetail: resultsWithDetail.length,
      correctCount,
      partialCount,
      wrongCount,
      achievementPercent,
      empiricalDifficulty,
    };
  });
}
