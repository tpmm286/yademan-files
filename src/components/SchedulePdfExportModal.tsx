import React, { useState, useRef } from 'react';
import {
  FileText,
  Download,
  Printer,
  X,
  User,
  GraduationCap,
  Sparkles,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle,
  BookOpen,
  Award,
  Layers,
  Palette,
  ShieldAlert,
  Info,
  CheckSquare,
  ChevronDown,
  Smartphone,
  Grid,
  Image as ImageIcon,
  CalendarRange,
  Brain,
  Sun,
  Moon,
  Zap,
  Activity,
  Check,
  ListCheck,
  Sliders,
} from 'lucide-react';
import {
  StudentLesson,
  TopicItem,
  BusySlot,
  StudentRoutineConfig,
  GeneratedStudyBlock,
} from '../types';
import {
  PERSIAN_WEEK_DAYS,
  toPersianDigits,
  formatPersianDate,
  parseTimeStrToMinutes,
  formatMinutesToTimeStr,
} from '../utils/dateUtils';
import { analyzeStudentSchedule } from '../utils/studentAnalysisUtils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface SchedulePdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessons: StudentLesson[];
  topics: TopicItem[];
  busySlots: BusySlot[];
  routine: StudentRoutineConfig;
  studyBlocks: GeneratedStudyBlock[];
}

const JALALI_MONTHS = [
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
];

// Helper to get number of days in Jalali months
const getJalaliMonthDays = (month: string): number => {
  if (['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور'].includes(month)) return 31;
  if (['اسفند'].includes(month)) return 29;
  return 30;
};

// Helper to get range of selected months
const getSelectedMonthsRange = (start: string, end: string): string[] => {
  const startIdx = JALALI_MONTHS.indexOf(start);
  const endIdx = JALALI_MONTHS.indexOf(end);
  if (startIdx === -1 || endIdx === -1) return [start];
  if (startIdx <= endIdx) {
    return JALALI_MONTHS.slice(startIdx, endIdx + 1);
  } else {
    // Wrap around academic year
    return [...JALALI_MONTHS.slice(startIdx), ...JALALI_MONTHS.slice(0, endIdx + 1)];
  }
};

// Pure mathematical OKLCH to RGB converter for html2canvas compatibility
function oklchToRgbMath(l: number, c: number, h: number, a: number = 1): string {
  const rad = (h * Math.PI) / 180;
  const a_lab = c * Math.cos(rad);
  const b_lab = c * Math.sin(rad);

  // OKLAB -> LMS
  const l_ = l + 0.3963377774 * a_lab + 0.2158037573 * b_lab;
  const m_ = l - 0.1055613458 * a_lab - 0.0638541728 * b_lab;
  const s_ = l - 0.0894841775 * a_lab - 0.1291976484 * b_lab;

  const l_3 = l_ * l_ * l_;
  const m_3 = m_ * m_ * m_;
  const s_3 = s_ * s_ * s_;

  // LMS -> Linear RGB
  const r_lin = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
  const g_lin = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
  const b_lin = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.7076147010 * s_3;

  // Linear RGB -> sRGB
  const toSrgb = (val: number) => {
    if (val <= 0) return 0;
    if (val >= 1) return 255;
    const srgb = val <= 0.0031308 ? 12.92 * val : 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
    return Math.min(255, Math.max(0, Math.round(srgb * 255)));
  };

  const r = toSrgb(r_lin);
  const g = toSrgb(g_lin);
  const b = toSrgb(b_lin);

  return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
}

// Convert any oklch(...) or oklab(...) substring in a CSS string to rgb/rgba
export const convertOklchToRgb = (colorStr: string): string => {
  if (!colorStr || typeof colorStr !== 'string' || (!colorStr.includes('oklch') && !colorStr.includes('oklab'))) {
    return colorStr;
  }

  let result = colorStr.replace(/oklch\(\s*([\d.%]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)/gi, (_, lStr, cStr, hStr, aStr) => {
    try {
      let l = parseFloat(lStr);
      if (lStr.includes('%')) l = l / 100;
      const c = parseFloat(cStr);
      const h = parseFloat(hStr);
      let a = 1;
      if (aStr) {
        a = parseFloat(aStr);
        if (aStr.includes('%')) a = a / 100;
      }
      return oklchToRgbMath(l, c, h, a);
    } catch {
      return 'rgb(79, 70, 229)';
    }
  });

  result = result.replace(/oklch\([^)]+\)/gi, 'rgb(79, 70, 229)');
  result = result.replace(/oklab\([^)]+\)/gi, 'rgb(79, 70, 229)');

  return result;
};

const sanitizeClonedDocForHtml2Canvas = (clonedDoc: Document) => {
  // 1. Sanitize all <style> tag contents in clonedDoc
  const styleTags = clonedDoc.querySelectorAll('style');
  styleTags.forEach((styleTag) => {
    if (styleTag.textContent && (styleTag.textContent.includes('oklch') || styleTag.textContent.includes('oklab'))) {
      styleTag.textContent = convertOklchToRgb(styleTag.textContent);
    }
  });

  // 2. Sanitize inline style attributes and computed styles on all elements
  const elements = clonedDoc.querySelectorAll<HTMLElement>('*');
  elements.forEach((el) => {
    const styleAttr = el.getAttribute('style');
    if (styleAttr && (styleAttr.includes('oklch') || styleAttr.includes('oklab'))) {
      el.setAttribute('style', convertOklchToRgb(styleAttr));
    }

    try {
      const computed = window.getComputedStyle(el);
      const propsToCheck = ['backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'fill', 'stroke', 'outlineColor'];
      
      propsToCheck.forEach((prop) => {
        const val = (computed as any)[prop];
        if (typeof val === 'string' && (val.includes('oklch') || val.includes('oklab'))) {
          (el.style as any)[prop] = convertOklchToRgb(val);
        }
      });
    } catch {
      // Ignore
    }
  });
};

export const SchedulePdfExportModal: React.FC<SchedulePdfExportModalProps> = ({
  isOpen,
  onClose,
  lessons,
  topics,
  busySlots,
  routine,
  studyBlocks,
}) => {
  if (!isOpen) return null;

  // Form & Export Options
  const [timeHorizon, setTimeHorizon] = useState<'monthly' | 'yearly' | 'weekly' | 'custom_range'>('monthly');
  const [colorMode, setColorMode] = useState<'color' | 'monochrome'>('color');
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [selectedMonth, setSelectedMonth] = useState<string>('مهر');
  const [startMonth, setStartMonth] = useState<string>('مهر');
  const [endMonth, setEndMonth] = useState<string>('دی');
  
  // Optional Calendar Grid View Toggle
  const [showCalendarGrid, setShowCalendarGrid] = useState<boolean>(true);
  const [calendarStartDay, setCalendarStartDay] = useState<number>(0); // 0 = Saturday offset

  // Collapsible controls bar state
  const [isControlsOpen, setIsControlsOpen] = useState<boolean>(true);
  
  // Detailed Content Options (شمول جزئیات کاملاً سفارشی در خروجی PDF)
  const [includeFullHourlySchedule, setIncludeFullHourlySchedule] = useState<boolean>(true);
  const [includeRoutinesAndBusy, setIncludeRoutinesAndBusy] = useState<boolean>(true);
  const [includeEbbinghausDetails, setIncludeEbbinghausDetails] = useState<boolean>(true);
  const [includeSmartAnalysis, setIncludeSmartAnalysis] = useState<boolean>(true);

  // Quick Presets
  const handleSelectAllDetails = () => {
    setIncludeFullHourlySchedule(true);
    setIncludeRoutinesAndBusy(true);
    setIncludeEbbinghausDetails(true);
    setIncludeSmartAnalysis(true);
    setShowCalendarGrid(true);
  };

  const handleSelectMinimalView = () => {
    setIncludeFullHourlySchedule(false);
    setIncludeRoutinesAndBusy(false);
    setIncludeEbbinghausDetails(false);
    setIncludeSmartAnalysis(false);
    setShowCalendarGrid(true);
  };

  // Student & Advisor Customization Fields
  const [studentName, setStudentName] = useState<string>('دانش‌آموز عزیزم');
  const [studentGrade, setStudentGrade] = useState<string>('دوازدهم تجربی - کنکور سراسری');
  const [advisorName, setAdvisorName] = useState<string>('مرکز مشاوره و برنامه‌ریزی تحصیلی');
  const [targetWeeklyHours, setTargetWeeklyHours] = useState<number>(45);
  const [advisorNote, setAdvisorNote] = useState<string>(
    'مرورهای ۵ مرحله‌ای ابینگهاوس را دقیقاً در ساعات مقرر انجام دهید. پارت‌های مطالعه اختصاصی را در اوج هوشیاری اول صبح اجرا نموده و از تلف شدن فواصل بین کلاسی جلوگیری کنید.'
  );

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [exportStepText, setExportStepText] = useState<string>('');
  const [exportProgress, setExportProgress] = useState<number>(0);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Schedule analysis
  const analysis = analyzeStudentSchedule(lessons, topics, routine, studyBlocks);

  // Subject summary
  const subjectsList = Array.from(new Set([...lessons.map((l) => l.subject), ...topics.map((t) => t.lessonSubject || '').filter(Boolean)]));

  // Determine active months list
  const activeMonths =
    timeHorizon === 'monthly'
      ? [selectedMonth]
      : timeHorizon === 'custom_range'
      ? getSelectedMonthsRange(startMonth, endMonth)
      : JALALI_MONTHS;

  // Helper to clone element offscreen for robust mobile/desktop capture
  const createOffscreenClone = (sourceEl: HTMLElement): HTMLElement => {
    const clone = sourceEl.cloneNode(true) as HTMLElement;
    clone.style.width = pageOrientation === 'landscape' ? '1120px' : '800px'; // A4 landscape vs portrait width
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.transform = 'none';
    clone.style.zIndex = '-9999';
    document.body.appendChild(clone);
    return clone;
  };

  // PDF Download Action - Section-Block jsPDF Engine to Prevent Page-Break Clipping
  const handleDownloadPdf = async () => {
    if (!pdfContainerRef.current) return;
    setIsGenerating(true);
    setExportProgress(10);
    setExportStepText('۱/۴: قالب‌بندی و تفکیک بخش‌های تقویم و جداول...');

    // Wait for UI paint cycle so loading overlay shows
    await new Promise((r) => setTimeout(r, 200));

    let clone: HTMLElement | null = null;
    try {
      const element = pdfContainerRef.current;
      clone = createOffscreenClone(element);

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      const renderScale = isMobile ? 1.3 : 1.8;

      setExportProgress(25);
      setExportStepText('۲/۴: اندازه‌گیری ارتفاع کارت‌ها جهت جلوگیری از بریدگی صفحات...');
      await new Promise((r) => setTimeout(r, 100));

      const pdf = new jsPDF({
        orientation: pageOrientation === 'landscape' ? 'l' : 'p',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pdfWidth = pdf.internal.pageSize.getWidth(); // 297mm if landscape, 210mm if portrait
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 210mm if landscape, 297mm if portrait

      // Calibrate margins based on orientation to prevent table overflow & edge clipping
      const marginX = pageOrientation === 'landscape' ? 10 : 8;
      const marginY = pageOrientation === 'landscape' ? 10 : 8;
      const printableWidth = pdfWidth - (marginX * 2); // 277mm in landscape, 194mm in portrait
      const printableHeight = pdfHeight - (marginY * 2); // 190mm in landscape, 281mm in portrait

      let currentY = marginY;

      // Query defined section blocks in cloned document
      let sectionNodes = Array.from(clone.querySelectorAll<HTMLElement>('.pdf-section-block'));
      if (sectionNodes.length === 0) {
        sectionNodes = Array.from(clone.children) as HTMLElement[];
      }

      const totalSections = sectionNodes.length;

      for (let i = 0; i < totalSections; i++) {
        const sec = sectionNodes[i];

        const currentProgress = 30 + Math.round((i / totalSections) * 55);
        setExportProgress(currentProgress);
        setExportStepText(`۳/۴: پردازش بخش ${toPersianDigits(i + 1)} از ${toPersianDigits(totalSections)}...`);

        // Check CSS break-after / page-break-after properties on element
        const secStyle = window.getComputedStyle(sec);
        const hasBreakAfter =
          sec.style.breakAfter === 'page' ||
          sec.style.breakAfter === 'always' ||
          sec.style.pageBreakAfter === 'always' ||
          secStyle.breakAfter === 'page' ||
          secStyle.breakAfter === 'always' ||
          secStyle.pageBreakAfter === 'always' ||
          sec.classList.contains('break-after-page');

        // Render individual section canvas with full landscape/portrait window width
        const captureWidth = pageOrientation === 'landscape' ? 1120 : 800;
        const secCanvas = await html2canvas(sec, {
          scale: renderScale,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: captureWidth,
          onclone: (clonedDoc) => {
            sanitizeClonedDocForHtml2Canvas(clonedDoc);
          },
        });

        const secImgHeight = (secCanvas.height * printableWidth) / secCanvas.width;

        // If a single section is longer than 1 printable page (long lists / tables), slice it cleanly
        if (secImgHeight > printableHeight) {
          const pageCanvasHeight = (secCanvas.width * printableHeight) / printableWidth;
          let offset = 0;

          while (offset < secCanvas.height) {
            const sliceHeight = Math.min(pageCanvasHeight, secCanvas.height - offset);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = secCanvas.width;
            sliceCanvas.height = sliceHeight;
            const ctx = sliceCanvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, sliceCanvas.width, sliceHeight);
              ctx.drawImage(
                secCanvas,
                0, offset, secCanvas.width, sliceHeight,
                0, 0, secCanvas.width, sliceHeight
              );
            }
            const sliceImgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
            const sliceImgHeight = (sliceHeight * printableWidth) / secCanvas.width;

            if (currentY + sliceImgHeight > pdfHeight - marginY && currentY > marginY + 2) {
              pdf.addPage();
              currentY = marginY;
            }

            pdf.addImage(sliceImgData, 'JPEG', marginX, currentY, printableWidth, sliceImgHeight);
            currentY += sliceImgHeight + 3;
            offset += sliceHeight;

            if (offset < secCanvas.height) {
              pdf.addPage();
              currentY = marginY;
            }
          }
        } else {
          const imgData = secCanvas.toDataURL('image/jpeg', 0.92);

          // If section doesn't fit on current page and currentY is not at top, start new page
          if (currentY + secImgHeight > pdfHeight - marginY && currentY > marginY + 2) {
            pdf.addPage();
            currentY = marginY;
          }

          // Render section into PDF
          pdf.addImage(imgData, 'JPEG', marginX, currentY, printableWidth, secImgHeight);
          currentY += secImgHeight + 3; // 3mm vertical gap between section cards
        }

        // Respect explicit CSS break-after: page / page-break-after: always
        if (hasBreakAfter && i < totalSections - 1 && currentY > marginY) {
          pdf.addPage();
          currentY = marginY;
        }
      }

      setExportProgress(90);
      setExportStepText('۴/۴: آماده‌سازی نهایی و ارسال فایل به دستگاه...');
      await new Promise((r) => setTimeout(r, 100));

      const fileName = `برنامه_${timeHorizon === 'monthly' ? `ماهیانه_${selectedMonth}` : timeHorizon === 'custom_range' ? `بازه_${startMonth}_تا_${endMonth}` : timeHorizon === 'yearly' ? 'سالیانه' : 'هفتگی'}_${studentName.replace(/\s+/g, '_')}.pdf`;

      // Direct Blob Download - Universal Mobile & Desktop Support (No print modal popup)
      const pdfBlob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);

      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      setExportProgress(100);
      setExportStepText('دانلود فایل PDF با موفقیت انجام شد!');

      // Direct mobile fallback open blob in new tab if browser blocked auto-download
      if (isMobile) {
        setTimeout(() => {
          window.open(blobUrl, '_blank');
        }, 300);
      }

    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('خطا در صدور PDF. می‌توانید از گزینه «دانلود تصویر HD» یا «پرینت مستقیم» استفاده فرمایید.');
    } finally {
      if (clone && clone.parentNode) {
        clone.parentNode.removeChild(clone);
      }
      setTimeout(() => {
        setIsGenerating(false);
        setExportProgress(0);
        setExportStepText('');
      }, 400);
    }
  };

  // Direct High-Resolution Image Export (Fallback for older mobile phones)
  const handleDownloadMobileImage = async () => {
    if (!pdfContainerRef.current) return;
    setIsGeneratingImage(true);
    setExportProgress(15);
    setExportStepText('۱/۳: در حال آمادگی و قالب‌بندی عناصر تصویر...');

    // Wait for UI paint cycle so loading overlay shows
    await new Promise((r) => setTimeout(r, 200));

    let clone: HTMLElement | null = null;
    try {
      const element = pdfContainerRef.current;
      clone = createOffscreenClone(element);

      setExportProgress(45);
      setExportStepText('۲/۳: در حال پردازش گرافیکی پیکسل‌ها...');
      await new Promise((r) => setTimeout(r, 100));

      const canvas = await html2canvas(clone, {
        scale: 1.4,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: pageOrientation === 'landscape' ? 1120 : 800,
        onclone: (clonedDoc) => {
          sanitizeClonedDocForHtml2Canvas(clonedDoc);
        },
      });

      if (clone && clone.parentNode) {
        clone.parentNode.removeChild(clone);
        clone = null;
      }

      setExportProgress(80);
      setExportStepText('۳/۳: در حال ایجاد لینک تصویر HD و ارسال...');
      await new Promise((r) => setTimeout(r, 100));

      const dataUrl = canvas.toDataURL('image/png');
      const fileName = `تصویر_برنامه_${studentName.replace(/\s+/g, '_')}.png`;

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportProgress(100);
      setExportStepText('با موفقیت دانلود شد!');

      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        setTimeout(() => {
          window.open(dataUrl, '_blank');
        }, 300);
      }

    } catch (err) {
      console.error('Error generating image:', err);
      alert('خطا در دانلود تصویر. لطفاً از گزینه پرینت استفاده کنید.');
    } finally {
      if (clone && clone.parentNode) {
        clone.parentNode.removeChild(clone);
      }
      setTimeout(() => {
        setIsGeneratingImage(false);
        setExportProgress(0);
        setExportStepText('');
      }, 400);
    }
  };

  // Direct Print / Save Browser Vector PDF with Mobile Window Isolation
  const handlePrint = () => {
    const element = pdfContainerRef.current;
    if (!element) return;

    try {
      const stylesHTML = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(el => el.outerHTML)
        .join('\n');

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="fa">
            <head>
              <meta charset="utf-8">
              <title>برنامه تحصیلی - ${studentName}</title>
              ${stylesHTML}
              <style>
                @media print {
                  body { margin: 0; padding: 12px; background: white; -webkit-print-color-adjust: exact; }
                  @page { size: A4 ${pageOrientation}; margin: 8mm; }
                }
                body { font-family: Vazirmatn, system-ui, -apple-system, sans-serif; background: white; color: #0f172a; }
              </style>
            </head>
            <body>
              <div style="width: 100%; max-width: ${pageOrientation === 'landscape' ? '1120px' : '800px'}; margin: 0 auto;">
                ${element.outerHTML}
              </div>
              <script>
                setTimeout(() => {
                  window.print();
                  window.close();
                }, 500);
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        window.print();
      }
    } catch {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs p-2 sm:p-4 flex flex-col items-center justify-start sm:justify-center animate-in fade-in" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl my-auto flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden relative">
        
        {/* FULL-SCREEN PROCESSING & PROGRESS BOARD OVERLAY (بورد لودینگ و نوار پیشرفت) */}
        {(isGenerating || isGeneratingImage) && (
          <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 text-white animate-in fade-in duration-200" dir="rtl">
            <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 text-center">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-amber-400 animate-spin" />
                <Sparkles className="w-8 h-8 text-amber-400 animate-pulse" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base sm:text-lg font-black text-amber-300">
                  {isGenerating ? 'در حال تولید و ساخت فایل PDF' : 'در حال رندر و دانلود تصویر HD'}
                </h4>
                <p className="text-xs text-slate-300 font-semibold leading-relaxed">
                  {exportStepText || 'شکیبا باشید، برنامه‌ریزی شما در حال پردازش است...'}
                </p>
              </div>

              {/* Progress Bar Board */}
              <div className="space-y-1.5">
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700 p-0.5">
                  <div
                    className="bg-gradient-to-r from-amber-400 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-xs"
                    style={{ width: `${Math.max(5, exportProgress)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-bold text-slate-400">
                  <span>{toPersianDigits(exportProgress)}٪ تکمیل شد</span>
                  <span>قالب‌بندی استاندارد A4</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-medium leading-relaxed">
                💡 <span className="text-amber-300 font-bold">راهنما:</span> جهت جلوگیری از اخلال در دانلود، تا پایان پردازش این صفحه را نبندید.
              </div>
            </div>
          </div>
        )}

        {/* MODAL HEADER */}
        <div className="p-3.5 sm:p-5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-xs shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-lg font-bold truncate">دانلود و صدور PDF برنامه تحصیلی (تنظیم بازه و تقویم)</h3>
              <p className="text-[11px] sm:text-xs text-indigo-200 mt-0.5 truncate hidden sm:block">
                قابلیت خروجی تقویم شطرنجی ماهانه، سالانه و بازه انتخابی + بهینه‌شده برای کلیه موبایل‌ها
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Toggle options bar button for mobile and desktop */}
            <button
              type="button"
              onClick={() => setIsControlsOpen(!isControlsOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/20"
              title="نمایش یا بستن نوار تنظیمات خروجی"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-[11px] sm:text-xs">{isControlsOpen ? 'بستن تنظیمات' : 'تنظیمات خروجی'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isControlsOpen ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CONTROLS BAR (Collapsible & Scrollable) */}
        {isControlsOpen && (
          <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0 max-h-[45vh] sm:max-h-[50vh] overflow-y-auto touch-pan-y">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              {/* Time Horizon Selector */}
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">تنظیم بازه زمانی برنامه (افق زمانی):</label>
                <div className="flex bg-white p-1 rounded-xl border border-slate-200 text-xs gap-0.5">
                  <button
                    type="button"
                    onClick={() => setTimeHorizon('monthly')}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                      timeHorizon === 'monthly'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📅 ماهانه
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeHorizon('custom_range')}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                      timeHorizon === 'custom_range'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📆 بازه دلخواه
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeHorizon('yearly')}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                      timeHorizon === 'yearly'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🗓️ سالانه
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeHorizon('weekly')}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                      timeHorizon === 'weekly'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📋 هفتگی
                  </button>
                </div>
              </div>

              {/* Color Mode Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">حالت استایل خروجی:</label>
                <div className="flex bg-white p-1 rounded-xl border border-slate-200 text-xs gap-0.5">
                  <button
                    type="button"
                    onClick={() => setColorMode('color')}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
                      colorMode === 'color'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Palette className="w-3.5 h-3.5" />
                    <span>رنگی</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorMode('monochrome')}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
                      colorMode === 'monochrome'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>سیاه/سفید</span>
                  </button>
                </div>
              </div>

              {/* Page Orientation Selector (عمودی / افقی) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">جهت صفحه PDF:</label>
                <div className="flex bg-white p-1 rounded-xl border border-slate-200 text-xs gap-0.5">
                  <button
                    type="button"
                    onClick={() => setPageOrientation('portrait')}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
                      pageOrientation === 'portrait'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>📱 عمودی</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageOrientation('landscape')}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1 ${
                      pageOrientation === 'landscape'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🖥️ افقی</span>
                  </button>
                </div>
              </div>

              {/* Student Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">نام دانش‌آموز / دانش‌جو:</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-semibold"
                  placeholder="نام کامل"
                />
              </div>
            </div>

            {/* DYNAMIC DATE RANGE PICKERS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200/80">
              {timeHorizon === 'monthly' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">انتخاب ماه تحصیلی:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    {JALALI_MONTHS.map((m) => (
                      <option key={m} value={m}>
                        ماه {m} ({toPersianDigits(getJalaliMonthDays(m))} روز)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {timeHorizon === 'custom_range' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">از ماه (شروع بازه):</label>
                    <select
                      value={startMonth}
                      onChange={(e) => setStartMonth(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                    >
                      {JALALI_MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">تا ماه (پایان بازه):</label>
                    <select
                      value={endMonth}
                      onChange={(e) => setEndMonth(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800"
                    >
                      {JALALI_MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* OPTIONAL CALENDAR GRID TOGGLE (اختیاری) */}
              <div className="sm:col-span-2 flex items-center gap-3 bg-indigo-50/70 border border-indigo-100 p-2.5 rounded-xl">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-indigo-950">
                  <input
                    type="checkbox"
                    checked={showCalendarGrid}
                    onChange={(e) => setShowCalendarGrid(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <Grid className="w-4 h-4 text-indigo-600" />
                  <span>نمایش به صورت تقویم شطرنجی و شبکه‌ای (Calendar Grid View)</span>
                </label>
              </div>
            </div>

            {/* DETAILED CONTENT SELECTION BAR (انتخاب جزئیات کامل خروجی) */}
            <div className="p-3 bg-white rounded-2xl border border-indigo-100 shadow-2xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-950">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  <span>انتخاب جزئیات زمان‌بندی و مشغله‌ها جهت درج در PDF:</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAllDetails}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors border border-indigo-200"
                  >
                    ✨ انتخاب همه جزئیات (کامل)
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectMinimalView}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors border border-slate-200"
                  >
                    📄 خروجی ساده (فقط تقویم)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none hover:bg-indigo-50/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeFullHourlySchedule}
                    onChange={(e) => setIncludeFullHourlySchedule(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 block">ساعت دقیق پارت‌ها</span>
                    <span className="text-[10px] text-slate-500">زمان شروع/پایان و دروس</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none hover:bg-indigo-50/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeRoutinesAndBusy}
                    onChange={(e) => setIncludeRoutinesAndBusy(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <Sun className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 block">روتین و مشغله‌ها</span>
                    <span className="text-[10px] text-slate-500">خواب، بیداری، کلاس‌ها</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none hover:bg-indigo-50/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeEbbinghausDetails}
                    onChange={(e) => setIncludeEbbinghausDetails(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <Brain className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 block">مراحل ابینگهاوس</span>
                    <span className="text-[10px] text-slate-500">مباحث و ۵ گام مرور</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none hover:bg-indigo-50/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={includeSmartAnalysis}
                    onChange={(e) => setIncludeSmartAnalysis(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <Activity className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 block">تحلیل هوشمند و تعادل</span>
                    <span className="text-[10px] text-slate-500">ارزیابی فشار و توصیه‌ها</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Expandable Counselor Settings */}
            <details className="text-xs group pt-1">
              <summary className="font-bold text-indigo-700 cursor-pointer hover:underline flex items-center gap-1 select-none">
                <span>✏️ ویرایش جزئیات مشاور، مقطع و توصیه‌های آموزشی</span>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-2 border-t border-slate-200">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">مقطع و رشته تحصیلی:</label>
                  <input
                    type="text"
                    value={studentGrade}
                    onChange={(e) => setStudentGrade(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">نام مشاور / مرکز مشاوره:</label>
                  <input
                    type="text"
                    value={advisorName}
                    onChange={(e) => setAdvisorName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">هدف مطالعه هفتگی (ساعت):</label>
                  <input
                    type="number"
                    value={targetWeeklyHours}
                    onChange={(e) => setTargetWeeklyHours(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="font-semibold text-slate-700 block mb-1">توصیه و راهنمای کلیدی مشاور تحصیلی:</label>
                  <textarea
                    value={advisorNote}
                    onChange={(e) => setAdvisorNote(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>
            </details>
          </div>
        )}

        {/* PRINTABLE PDF CONTENT PREVIEW AREA */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-slate-200/70 min-h-[250px] touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div
            ref={pdfContainerRef}
            id="pdf-export-content"
            className={`mx-auto ${pageOrientation === 'landscape' ? 'max-w-6xl' : 'max-w-4xl'} p-5 sm:p-8 rounded-2xl transition-all shadow-md ${
              colorMode === 'monochrome'
                ? 'bg-white text-black border-2 border-slate-900 printable-monochrome'
                : 'bg-white text-slate-900 border border-slate-200 printable-color'
            }`}
            style={{ fontFamily: 'inherit', backgroundColor: '#ffffff', color: '#0f172a' }}
          >
            {/* DOCUMENT HEADER */}
            <div
              className={`pdf-section-block p-5 rounded-2xl mb-6 border ${
                colorMode === 'monochrome'
                  ? 'border-slate-900 bg-slate-100 text-black'
                  : 'bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white border-indigo-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                      colorMode === 'monochrome'
                        ? 'bg-slate-900 text-white'
                        : 'bg-amber-400 text-slate-950 font-bold'
                    }`}
                  >
                    <GraduationCap className="w-7 h-7" />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-xl font-extrabold leading-tight">
                      تقویم و برنامه زمان‌بندی مطالعاتی تحصیلی
                    </h1>
                    <p
                      className={`text-xs mt-1 ${
                        colorMode === 'monochrome' ? 'text-slate-800 font-bold' : 'text-indigo-200'
                      }`}
                    >
                      {timeHorizon === 'monthly'
                        ? `تقویم برنامه‌ریزی ماهانه - ویژه ماه ${selectedMonth}`
                        : timeHorizon === 'custom_range'
                        ? `جدول برنامه‌ریزی بازه ${startMonth} تا ${endMonth}`
                        : timeHorizon === 'yearly'
                        ? 'نقشه راه سالانه و برنامه‌ریزی ترمیک تحصیلی'
                        : 'جدول زمان‌بندی هفتگی و مرورهای فعال'}
                    </p>
                  </div>
                </div>

                <div
                  className={`text-left p-2.5 rounded-xl text-xs font-bold border shrink-0 ${
                    colorMode === 'monochrome'
                      ? 'border-slate-900 bg-white text-black'
                      : 'border-white/20 bg-white/10 text-amber-300'
                  }`}
                >
                  <div>تاریخ صدور: {formatPersianDate(new Date())}</div>
                  <div className="mt-0.5 text-[11px] opacity-90">
                    سیستم هوشمند مرور ابینگهاوس
                  </div>
                </div>
              </div>
            </div>

            {/* METADATA INFO GRID */}
            <div
              className={`pdf-section-block grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl mb-6 text-xs border ${
                colorMode === 'monochrome'
                  ? 'border-slate-900 bg-slate-50 text-black'
                  : 'border-indigo-100 bg-indigo-50/50 text-slate-800'
              }`}
            >
              <div>
                <span className="font-bold text-slate-500 block mb-0.5">نام دانش‌آموز:</span>
                <span className="font-extrabold text-sm">{studentName}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block mb-0.5">مقطع و رشته:</span>
                <span className="font-bold">{studentGrade}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block mb-0.5">مشاور تحصیلی:</span>
                <span className="font-bold">{advisorName}</span>
              </div>
              <div>
                <span className="font-bold text-slate-500 block mb-0.5">هدف مطالعه هفتگی:</span>
                <span className="font-extrabold text-indigo-700">
                  {toPersianDigits(targetWeeklyHours)} ساعت در هفته
                </span>
              </div>
            </div>

            {/* 1. CALENDAR GRID VIEW (If Enabled and applicable) */}
            {showCalendarGrid && (timeHorizon === 'monthly' || timeHorizon === 'custom_range' || timeHorizon === 'yearly') && (
              <div className="space-y-6 mb-6">
                {activeMonths.map((mName) => {
                  const daysInMonth = getJalaliMonthDays(mName);
                  return (
                    <div key={mName} className="pdf-section-block space-y-3 p-4 rounded-2xl border border-slate-200 bg-white shadow-xs" style={{ breakAfter: 'page', pageBreakAfter: 'always', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                      <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                        <h3 className="font-extrabold text-sm flex items-center gap-2 text-indigo-900">
                          <CalendarIcon className="w-4 h-4 text-indigo-600" />
                          <span>تقویم برنامه روزانه - ماه {mName} ({toPersianDigits(daysInMonth)} روز)</span>
                        </h3>
                        <span className="text-xs font-bold text-slate-600">
                          هدف ماهانه: {toPersianDigits(targetWeeklyHours * 4)} ساعت
                        </span>
                      </div>

                      {/* 7 Columns Day Names Header */}
                      <div className="grid grid-cols-7 gap-1 text-center font-extrabold text-[11px] bg-indigo-900 text-white py-1.5 rounded-t-xl">
                        {PERSIAN_WEEK_DAYS.map((d) => (
                          <div key={d.key}>{d.name}</div>
                        ))}
                      </div>

                      {/* 30/31 Days Grid */}
                      <div className="grid grid-cols-7 gap-1 text-right text-[10px]">
                        {Array.from({ length: daysInMonth }).map((_, idx) => {
                          const dayNum = idx + 1;
                          const weekDayIdx = (calendarStartDay + idx) % 7;
                          const weekDayObj = PERSIAN_WEEK_DAYS.find((d) => d.dayIndex === weekDayIdx) || PERSIAN_WEEK_DAYS[0];
                          
                          const dayLessons = lessons.filter((l) => l.dayOfWeek === weekDayIdx);
                          const dayBlocks = studyBlocks.filter((b) => b.dayOfWeek === weekDayIdx);

                          return (
                            <div
                              key={dayNum}
                              className={`p-1.5 rounded-lg border min-h-[78px] flex flex-col justify-between ${
                                colorMode === 'monochrome'
                                  ? 'border-slate-800 bg-slate-50'
                                  : 'border-slate-200 bg-white hover:bg-indigo-50/30'
                              }`}
                            >
                              <div className="flex items-center justify-between border-b pb-1 mb-1 border-slate-100">
                                <span className="font-extrabold text-xs text-indigo-950">
                                  {toPersianDigits(dayNum)}
                                </span>
                                <span className="text-[9px] text-slate-400 font-medium">
                                  {weekDayObj.name}
                                </span>
                              </div>

                              <div className="space-y-0.5 text-[9.5px]">
                                {dayLessons.length > 0 ? (
                                  <div className="text-indigo-900 font-bold truncate">
                                    🏫 {toPersianDigits(dayLessons.length)} زنگ مدرسه
                                  </div>
                                ) : (
                                  <div className="text-slate-400">مطالعه خانگی</div>
                                )}

                                <div className="text-emerald-800 font-semibold truncate">
                                  📚 {dayBlocks.length > 0 ? `${toPersianDigits(dayBlocks.length)} پارت` : 'پارت مرور'}
                                </div>
                              </div>

                              <div className="pt-1 border-t border-slate-100 text-[8.5px] font-bold text-slate-500 flex justify-between">
                                <span>🧠 ابینگهاوس</span>
                                <span className="text-indigo-700">{toPersianDigits(Math.round(targetWeeklyHours / 7))}س</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. MONTHLY TABULAR BREAKDOWN (If Calendar view disabled or supplementary) */}
            {!showCalendarGrid && timeHorizon === 'monthly' && (
              <div className="space-y-5 mb-6">
                <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                  <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-indigo-600" />
                    <span>برنامه تفکیکی ۴ هفته‌ای ماه {selectedMonth}</span>
                  </h3>
                  <span className="text-xs font-bold text-slate-600">
                    مجموع هدف ماهانه: {toPersianDigits(targetWeeklyHours * 4)} ساعت
                  </span>
                </div>

                <div className="space-y-3">
                  {[1, 2, 3, 4].map((weekNum) => (
                    <div
                      key={weekNum}
                      className={`pdf-section-block p-4 rounded-xl border ${
                        colorMode === 'monochrome'
                          ? 'border-slate-900 bg-white'
                          : 'border-slate-200 bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`px-3 py-1 rounded-lg text-xs font-extrabold ${
                            colorMode === 'monochrome'
                              ? 'bg-slate-900 text-white'
                              : 'bg-indigo-600 text-white'
                          }`}
                        >
                          هفته {toPersianDigits(weekNum)} ماه {selectedMonth}
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          هدف مطالعاتی: {toPersianDigits(targetWeeklyHours)} ساعت | مرورهای ۵ مرحله‌ای
                        </span>
                      </div>

                      {/* 7 Days Grid */}
                      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] pt-1">
                        {PERSIAN_WEEK_DAYS.map((day) => {
                          const dayLessons = lessons.filter((l) => l.dayOfWeek === day.dayIndex);
                          const dayBlocks = studyBlocks.filter((b) => b.dayOfWeek === day.dayIndex);
                          return (
                            <div
                              key={day.dayIndex}
                              className={`p-2 rounded-lg border flex flex-col justify-between min-h-[90px] ${
                                colorMode === 'monochrome'
                                  ? 'border-slate-800 bg-slate-50'
                                  : 'border-indigo-100 bg-white'
                              }`}
                            >
                              <div className="font-extrabold text-slate-900 border-b pb-1 mb-1 border-slate-200">
                                {day.name}
                              </div>
                              <div className="space-y-1 text-[10px] text-slate-700 text-right">
                                {dayLessons.length > 0 ? (
                                  <div className="truncate font-semibold text-indigo-900">
                                    🏫 {dayLessons.length} زنگ مدرسه
                                  </div>
                                ) : (
                                  <div className="text-slate-400">بدون کلاس</div>
                                )}
                                <div className="truncate font-medium text-emerald-800">
                                  📚 {dayBlocks.length > 0 ? `${dayBlocks.length} پارت خانه` : 'پارت پیشنهادی'}
                                </div>
                              </div>
                              <div
                                className={`mt-2 pt-1 border-t text-[9px] font-bold ${
                                  colorMode === 'monochrome' ? 'border-slate-400' : 'border-slate-100 text-indigo-700'
                                }`}
                              >
                                هدف: {toPersianDigits(Math.round(targetWeeklyHours / 7))}س
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. YEARLY VIEW (سالیانه / ترمیک) */}
            {timeHorizon === 'yearly' && (
              <div className="pdf-section-block space-y-5 mb-6 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs" style={{ breakAfter: 'page', pageBreakAfter: 'always', breakInside: 'avoid' }}>
                <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                  <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>نقشه راه سالانه و زمان‌بندی ترم‌های تحصیلی</span>
                  </h3>
                  <span className="text-xs font-bold text-slate-600">
                    هدف کل سال: {toPersianDigits(targetWeeklyHours * 38)} ساعت مطالعه مفید
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table
                    className={`w-full text-xs text-right border-collapse border ${
                      colorMode === 'monochrome' ? 'border-slate-900' : 'border-slate-200'
                    }`}
                  >
                    <thead>
                      <tr
                        className={
                          colorMode === 'monochrome'
                            ? 'bg-slate-900 text-white border-b border-slate-900'
                            : 'bg-indigo-900 text-white'
                        }
                      >
                        <th className="p-2.5 border">ماه تحصیلی</th>
                        <th className="p-2.5 border">تمرکز اصلی مطالعاتی</th>
                        <th className="p-2.5 border">هدف مطالعه (ساعت)</th>
                        <th className="p-2.5 border">وضعیت آزمون / امتحانات</th>
                        <th className="p-2.5 border">توصیه مشاور</th>
                      </tr>
                    </thead>
                    <tbody>
                      {JALALI_MONTHS.map((month, idx) => {
                        let focus = 'آموزش و یادگیری عمیق مباحث جدید + مرور روزانه';
                        let goal = targetWeeklyHours * 4;
                        let examStatus = 'ارزیابی‌های کلاسی و آزمون آزمایشی';
                        let note = 'تثبیت پایه‌ای دروس اختصاصی';

                        if (month === 'دی' || month === 'خرداد') {
                          focus = 'جمع‌بندی امتحانات نهایی / نیم‌سال + مرور ۵ مرحله‌ای';
                          examStatus = '🚨 امتحانات رسمی / نهایی';
                          note = 'تمرکز ۱۰۰٪ بر نمونه سوالات نهایی و تشریحی';
                        } else if (month === 'فروردین') {
                          focus = 'طلایی‌ترین دوران جمع‌بندی نوروز و توربو مرور';
                          examStatus = 'آزمون‌های جامع جمع‌بندی';
                          note = 'اجرای دقیق پارت‌های تست‌زنی زمان‌دار';
                        } else if (month === 'تیر') {
                          focus = 'ارزیابی نهایی و کنکور سراسری / امتحانات پایان‌ترم';
                          examStatus = '🎯 کنکور / آزمون‌های سرنوشت‌ساز';
                          note = 'حفظ آرامش، تنظیم خواب و مرور خلاصه برداری‌ها';
                        }

                        return (
                          <tr
                            key={month}
                            className={`border-b ${
                              idx % 2 === 0
                                ? colorMode === 'monochrome'
                                  ? 'bg-slate-50'
                                  : 'bg-indigo-50/20'
                                : 'bg-white'
                            }`}
                          >
                            <td className="p-2.5 border font-extrabold text-slate-900">{month}</td>
                            <td className="p-2.5 border font-medium">{focus}</td>
                            <td className="p-2.5 border font-bold text-center">{toPersianDigits(goal)} ساعت</td>
                            <td className="p-2.5 border font-bold">{examStatus}</td>
                            <td className="p-2.5 border text-slate-700">{note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. WEEKLY VIEW (جدول هفتگی تفکیکی) */}
            {timeHorizon === 'weekly' && (
              <div className="pdf-section-block space-y-5 mb-6 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs" style={{ breakAfter: 'page', pageBreakAfter: 'always', breakInside: 'avoid' }}>
                <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                  <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span>جدول تفکیکی زنگ‌های مدرسه، مشغله‌ها و پارت‌های مطالعه هفتگی</span>
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table
                    className={`w-full text-xs text-center border-collapse border ${
                      colorMode === 'monochrome' ? 'border-slate-900' : 'border-slate-200'
                    }`}
                  >
                    <thead>
                      <tr
                        className={
                          colorMode === 'monochrome'
                            ? 'bg-slate-900 text-white'
                            : 'bg-indigo-900 text-white'
                        }
                      >
                        <th className="p-2 border">روز هفته</th>
                        <th className="p-2 border">صبح (مدرسه / کلاس)</th>
                        <th className="p-2 border">بعدازظهر (پارت ۱ و ۲)</th>
                        <th className="p-2 border">عصر (پارت ۳ و مشغله)</th>
                        <th className="p-2 border">شب (مرور ابینگهاوس)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PERSIAN_WEEK_DAYS.map((day) => {
                        const dayLessons = lessons.filter((l) => l.dayOfWeek === day.dayIndex);
                        const dayBlocks = studyBlocks.filter((b) => b.dayOfWeek === day.dayIndex);
                        const dayBusy = busySlots.filter((bs) => bs.isActive && bs.daysOfWeek.includes(day.dayIndex));

                        return (
                          <tr key={day.dayIndex} className="border-b">
                            <td className="p-2 border font-extrabold bg-slate-100 text-slate-900">{day.name}</td>
                            <td className="p-2 border text-right">
                              {dayLessons.length > 0 ? (
                                <div className="space-y-1">
                                  {dayLessons.map((l) => (
                                    <div key={l.id} className="text-[10px] font-bold text-slate-800">
                                      🏫 {l.subject} ({toPersianDigits(l.startTime)}-{toPersianDigits(l.endTime)})
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-[10px]">آزاد / مطالعه خانگی</span>
                              )}
                            </td>
                            <td className="p-2 border text-right">
                              {dayBlocks.slice(0, 2).map((b) => (
                                <div key={b.id} className="text-[10px] font-semibold text-indigo-900">
                                  📖 {b.title} ({toPersianDigits(b.startTime)})
                                </div>
                              ))}
                              {dayBlocks.length === 0 && <span className="text-slate-400 text-[10px]">-</span>}
                            </td>
                            <td className="p-2 border text-right">
                              {dayBusy.map((bs) => (
                                <div key={bs.id} className="text-[10px] font-bold text-rose-800">
                                  ⚡ مشغله: {bs.title} ({toPersianDigits(bs.startTime)})
                                </div>
                              ))}
                              {dayBlocks.slice(2, 4).map((b) => (
                                <div key={b.id} className="text-[10px] font-semibold text-emerald-900">
                                  📚 {b.title}
                                </div>
                              ))}
                            </td>
                            <td className="p-2 border text-right">
                              <div className="text-[10px] font-bold text-purple-900">
                                🧠 مرورهای ۵ مرحله‌ای ابینگهاوس (مطابق الگوریتم)
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. DETAILED HOURLY STUDY SCHEDULE (ساعت زمان‌بندی دقیق پارت‌های مطالعه) */}
            {includeFullHourlySchedule && studyBlocks.length > 0 && (
              <div className="pdf-section-block space-y-4 mb-6 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs" style={{ breakAfter: 'page', pageBreakAfter: 'always', breakInside: 'avoid' }}>
                <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                  <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2 text-indigo-950">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>جدول زمان‌بندی دقیق پارت‌های مطالعه و برنامه‌ریزی روزانه (ساعت به ساعت)</span>
                  </h3>
                  <span className="text-xs font-bold text-slate-500">
                    مجموع {toPersianDigits(studyBlocks.length)} پارت برنامه‌ریزی‌شده
                  </span>
                </div>

                <div className="space-y-3">
                  {PERSIAN_WEEK_DAYS.map((day) => {
                    const dayBlocks = studyBlocks.filter((b) => b.dayOfWeek === day.dayIndex);
                    if (dayBlocks.length === 0) return null;

                    return (
                      <div key={day.dayIndex} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                        <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-200">
                          <span className="font-extrabold text-xs text-indigo-900 flex items-center gap-1.5">
                            <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
                            <span>روز {day.name}</span>
                          </span>
                          <span className="text-[11px] font-bold text-slate-500">
                            {toPersianDigits(dayBlocks.length)} پارت مطالعاتی
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {dayBlocks.map((block) => {
                            let catLabel = 'مطالعه آزاد / تمرین';
                            let catClass = 'bg-slate-100 text-slate-800 border-slate-300';
                            if (block.category === 'ebbinghaus_review') {
                              catLabel = '🧠 مرور ۵ مرحله‌ای ابینگهاوس';
                              catClass = 'bg-purple-100 text-purple-900 border-purple-300 font-bold';
                            } else if (block.category === 'same_day_consolidation') {
                              catLabel = '🏫 تثبیت همان‌روز مدرسه';
                              catClass = 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold';
                            } else if (block.category === 'prep_tomorrow') {
                              catLabel = '📚 تکالیف و پیش‌خوانی فردا';
                              catClass = 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold';
                            }

                            return (
                              <div key={block.id} className="p-2.5 rounded-lg border bg-white flex flex-col justify-between border-slate-200">
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[11px] dir-ltr font-mono">
                                    {toPersianDigits(block.startTime)} - {toPersianDigits(block.endTime)}
                                  </span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${catClass}`}>
                                    {catLabel}
                                  </span>
                                </div>

                                <div className="font-extrabold text-slate-900 text-xs mt-0.5">
                                  {block.title}
                                </div>

                                {(block.relatedSubject || block.lessonSubject) && (
                                  <div className="text-[10.5px] text-slate-600 mt-1 flex items-center justify-between">
                                    <span>درس: <strong>{block.relatedSubject || block.lessonSubject}</strong></span>
                                    {block.difficulty && (
                                      <span className="text-[9.5px] font-bold text-slate-500">
                                        درجه: {block.difficulty === 'hard' ? 'سخت 🔥' : block.difficulty === 'medium' ? 'متوسط ⚖️' : 'آسان ⚡'}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {block.notes && (
                                  <div className="mt-1 text-[10px] text-indigo-900 bg-indigo-50/80 p-1 rounded border border-indigo-100 italic">
                                    📌 {block.notes}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 6. ROUTINE & BUSY SLOTS SCHEDULE (برنامه روتین بیداری/خواب و مشغله‌ها) */}
            {includeRoutinesAndBusy && (
              <div className="pdf-section-block space-y-4 mb-6 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs" style={{ breakAfter: 'page', pageBreakAfter: 'always', breakInside: 'avoid' }}>
                <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                  <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2 text-emerald-950">
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>جدول روتین روزانه سبک زندگی و مشغله‌های غیرمدرسه‌ای</span>
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-center">
                  <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/70">
                    <span className="text-[10px] text-amber-800 font-bold block mb-0.5">🌅 ساعت بیداری هدف:</span>
                    <span className="font-extrabold text-amber-950 text-sm">{toPersianDigits(routine.wakeUpTime)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70">
                    <span className="text-[10px] text-indigo-800 font-bold block mb-0.5">🏫 زمان خروج مدرسه:</span>
                    <span className="font-extrabold text-indigo-950 text-sm">{toPersianDigits(routine.schoolDepartureTime)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70">
                    <span className="text-[10px] text-indigo-800 font-bold block mb-0.5">🏡 زمان بازگشت خانه:</span>
                    <span className="font-extrabold text-indigo-950 text-sm">{toPersianDigits(routine.schoolReturnTime)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70">
                    <span className="text-[10px] text-emerald-800 font-bold block mb-0.5">🍱 ناهار و استراحت:</span>
                    <span className="font-extrabold text-emerald-950 text-sm">{toPersianDigits(routine.lunchRestMinutes)} دقیقه</span>
                  </div>
                  <div className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/70 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-purple-800 font-bold block mb-0.5">🛌 خواب شبانه هدف:</span>
                    <span className="font-extrabold text-purple-950 text-sm">{toPersianDigits(routine.bedTime)}</span>
                  </div>
                </div>

                {/* Busy slots list */}
                {busySlots.length > 0 && (
                  <div className="pt-2">
                    <h4 className="font-extrabold text-xs text-slate-800 mb-2 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-rose-600" />
                      <span>کلاس‌های غیرمدرسه‌ای و مشغله‌های هفتگی دانش‌آموز:</span>
                    </h4>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-right border-collapse border border-slate-200">
                        <thead>
                          <tr className="bg-slate-100 text-slate-800 font-bold">
                            <th className="p-2 border">عنوان مشغله / کلاس</th>
                            <th className="p-2 border text-center">ساعت شروع و پایان</th>
                            <th className="p-2 border">روزهای برگزاری</th>
                            <th className="p-2 border text-center">اولویت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {busySlots.map((bs) => {
                            const daysNames = bs.daysOfWeek
                              .map((dIdx) => PERSIAN_WEEK_DAYS.find((d) => d.dayIndex === dIdx)?.name || '')
                              .filter(Boolean)
                              .join('، ');

                            return (
                              <tr key={bs.id} className="border-b">
                                <td className="p-2 border font-bold text-slate-900">{bs.title}</td>
                                <td className="p-2 border text-center font-bold text-rose-700 dir-ltr">
                                  {toPersianDigits(bs.startTime)} - {toPersianDigits(bs.endTime)}
                                </td>
                                <td className="p-2 border font-semibold text-slate-700">{daysNames}</td>
                                <td className="p-2 border text-center font-bold text-indigo-700">
                                  {bs.priority === 'high' ? 'عالی (ثابت)' : 'متوسط'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 7. EBBINGHAUS TOPICS PROGRESSION (جدول تفکیکی مباحث و مراحل ۵ گانه ابینگهاوس) */}
            {includeEbbinghausDetails && topics.length > 0 && (
              <div className="pdf-section-block space-y-4 mb-6 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs" style={{ breakAfter: 'page', pageBreakAfter: 'always', breakInside: 'avoid' }}>
                <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                  <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2 text-purple-950">
                    <Brain className="w-4 h-4 text-purple-600" />
                    <span>جدول تفکیکی مباحث ثبت‌شده و وضعیت مرورهای ۵ مرحله‌ای منحنی ابینگهاوس</span>
                  </h3>
                  <span className="text-xs font-bold text-slate-500">
                    مجموع {toPersianDigits(topics.length)} مبحث درسی
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-purple-900 text-white font-bold">
                        <th className="p-2 border">عنوان مبحث</th>
                        <th className="p-2 border">درس مربوطه</th>
                        <th className="p-2 border text-center">تاریخ شروع مطالعه</th>
                        <th className="p-2 border text-center">مراحل تکمیل‌شده</th>
                        <th className="p-2 border">وضعیت مرور ۵ مرحله‌ای</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topics.map((tp) => (
                        <tr key={tp.id} className="border-b hover:bg-purple-50/30">
                          <td className="p-2 border font-bold text-slate-900">{tp.title}</td>
                          <td className="p-2 border font-semibold text-indigo-900">{tp.lessonSubject || 'عمومی'}</td>
                          <td className="p-2 border text-center font-mono text-slate-700">{formatPersianDate(tp.initialDate)}</td>
                          <td className="p-2 border text-center font-bold text-purple-700">
                            مرحله {toPersianDigits(tp.completedStages)} از ۵ ({toPersianDigits(Math.round((tp.completedStages / 5) * 100))}٪)
                          </td>
                          <td className="p-2 border text-slate-700">
                            <div className="flex items-center gap-1 text-[10px]">
                              {[1, 2, 3, 4, 5].map((st) => (
                                <span
                                  key={st}
                                  className={`px-1.5 py-0.5 rounded font-bold ${
                                    st <= tp.completedStages
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  گام {toPersianDigits(st)}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 8. SMART ANALYSIS & WORKLOAD METRICS (شاخص‌های هوشمند و تحلیل کارنامه) */}
            {includeSmartAnalysis && (
              <div className="pdf-section-block space-y-4 mb-6 p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs" style={{ breakAfter: 'page', pageBreakAfter: 'always', breakInside: 'avoid' }}>
                <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                  <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2 text-indigo-950">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    <span>تحلیل هوشمند شاخص‌های فشار مطالعاتی و سلامت بیوریتم تحصیلی</span>
                  </h3>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-200">
                    <span className="text-[10px] text-slate-500 block mb-0.5">کل ساعت مطالعه مفید:</span>
                    <span className="font-extrabold text-indigo-900 text-base">{toPersianDigits(analysis.totalStudyHours)} ساعت/هفته</span>
                  </div>
                  <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200">
                    <span className="text-[10px] text-slate-500 block mb-0.5">مطالعه اختصاصی منزل:</span>
                    <span className="font-extrabold text-emerald-900 text-base">{toPersianDigits(analysis.totalHomeStudyHours)} ساعت/هفته</span>
                  </div>
                  <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-slate-500 block mb-0.5">شاخص ریسک خستگی (Burnout):</span>
                    <span className="font-extrabold text-amber-900 text-base">{toPersianDigits(analysis.burnoutIndex)}٪</span>
                  </div>
                  <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200">
                    <span className="text-[10px] text-slate-500 block mb-0.5">میانگین استراحت خواب:</span>
                    <span className="font-extrabold text-purple-900 text-base">{toPersianDigits(analysis.averageSleepHours)} ساعت/شب</span>
                  </div>
                </div>

                {/* Daily workload risk */}
                <div className="pt-2">
                  <h4 className="font-bold text-xs text-slate-800 mb-2">ارزیابی بار مطالعاتی روزهای هفته:</h4>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10.5px]">
                    {analysis.dailyLoads.map((dl) => (
                      <div
                        key={dl.dayIndex}
                        className={`p-1.5 rounded-lg border flex flex-col justify-between ${
                          dl.loadLevel === 'heavy' || dl.loadLevel === 'overload'
                            ? 'bg-rose-50 border-rose-200 text-rose-900 font-bold'
                            : dl.loadLevel === 'balanced'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className="border-b pb-0.5 mb-0.5 border-slate-200">{dl.dayName}</span>
                        <span>{toPersianDigits(dl.homeStudyHours)}س خانه</span>
                        <span className="text-[9px] mt-0.5 opacity-80">{dl.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SUBJECT WEIGHT & HOURS TABLE */}
            <div className="pdf-section-block mb-6 space-y-3">
              <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 border-b border-slate-300 pb-1.5 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>جدول سهم‌بندی دروس و وزن‌دهی هفتگی مطالعاتی</span>
              </h4>

              <div className="overflow-x-auto">
                <table
                  className={`w-full text-xs text-right border-collapse border ${
                    colorMode === 'monochrome' ? 'border-slate-900' : 'border-slate-200'
                  }`}
                >
                  <thead>
                    <tr
                      className={
                        colorMode === 'monochrome'
                          ? 'bg-slate-200 text-slate-900 font-bold border-b border-slate-900'
                          : 'bg-slate-100 text-slate-800 font-bold'
                      }
                    >
                      <th className="p-2 border">عنوان درس / مبحث</th>
                      <th className="p-2 border text-center">تعداد زنگ مدرسه</th>
                      <th className="p-2 border text-center">پارت‌های مطالعه خانگی</th>
                      <th className="p-2 border text-center">ساعات پیشنهادی در هفته</th>
                      <th className="p-2 border">ضریب و اولویت مرور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-slate-500">
                          دروسی ثبت نشده است. (دروس از بخش کلاس‌های مدرسه و مباحث ابینگهاوس به‌صورت خودکار محاسبه می‌شوند)
                        </td>
                      </tr>
                    ) : (
                      subjectsList.map((subjectName) => {
                        const lessonCount = lessons.filter((l) => l.subject === subjectName).length;
                        const blockCount = studyBlocks.filter((b) => b.relatedSubject === subjectName || b.lessonSubject === subjectName).length;
                        const estHours = Math.round((lessonCount * 1.5 + blockCount * 1.2) * 10) / 10;

                        return (
                          <tr key={subjectName} className="border-b">
                            <td className="p-2 border font-bold text-slate-900">{subjectName}</td>
                            <td className="p-2 border text-center font-semibold">{toPersianDigits(lessonCount)}</td>
                            <td className="p-2 border text-center font-semibold">{toPersianDigits(blockCount)}</td>
                            <td className="p-2 border text-center font-extrabold text-indigo-700">
                              {toPersianDigits(estHours || 3)} ساعت
                            </td>
                            <td className="p-2 border text-slate-700">
                              اولویت عالی + مرور ۵ مرحله‌ای
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* COUNSELOR DIRECTIVES & SIGNATURE BOX */}
            <div
              className={`pdf-section-block p-4 rounded-xl border text-xs space-y-2 mb-6 ${
                colorMode === 'monochrome'
                  ? 'border-slate-900 bg-slate-50 text-black'
                  : 'border-amber-200 bg-amber-50/60 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2 font-extrabold text-amber-900">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>توصیه و راهنمای تحصیلی مشاور:</span>
              </div>
              <p className="leading-relaxed font-medium text-slate-800">{advisorNote}</p>

              <div className="pt-3 border-t border-slate-300/80 flex items-center justify-between text-[11px] font-bold">
                <div>تایید و امضاء مشاور تحصیلی: .......................................</div>
                <div>محل مهر / امضاء آموزشگاه</div>
              </div>
            </div>

            {/* DOCUMENT FOOTER */}
            <div className="pdf-section-block pt-3 border-t border-slate-300 text-center text-[10px] text-slate-500 flex items-center justify-between">
              <span>سامانه هوشمند مدیریت برنامه تحصیلی و منحنی یادگیری ابینگهاوس</span>
              <span>صفحه ۱ از ۱</span>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER ACTIONS - ENHANCED FOR MOBILE AND OLDER DEVICES */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium text-center sm:text-right">
            📱 ویژه گوشی‌های قدیمی: در صورت عدم دانلود PDF، دکمه «تصویر HD» یا «پرینت مستقیم» را فشارد دهید.
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {/* Direct Image Download (Universal Mobile Fallback) */}
            <button
              type="button"
              onClick={handleDownloadMobileImage}
              disabled={isGeneratingImage}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all border border-slate-300 disabled:opacity-50"
              title="دانلود تصویر HD - ایده‌آل برای موبایل‌های قدیمی و پیام‌رسان‌ها"
            >
              <ImageIcon className="w-3.5 h-3.5 text-slate-600" />
              <span>{isGeneratingImage ? 'صبر کنید...' : 'دانلود تصویر HD'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>پرینت مستقیم</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isGenerating ? 'در حال تولید PDF...' : 'دانلود فایل PDF'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

