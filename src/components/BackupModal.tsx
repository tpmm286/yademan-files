import React, { useState, useRef } from 'react';
import {
  Download,
  Upload,
  X,
  FileJson,
  CheckCircle2,
  AlertCircle,
  FileDown,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { TopicItem } from '../types';
import { toPersianDigits, formatPersianDateTime } from '../utils/dateUtils';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  topics: TopicItem[];
  onRestoreTopics: (restoredTopics: TopicItem[]) => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  topics,
  onRestoreTopics,
}) => {
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handler to export and download JSON
  const handleDownloadBackup = () => {
    try {
      const backupData = {
        app: 'Ebbinghaus Spaced Repetition',
        version: 1,
        exportedAt: new Date().toISOString(),
        totalTopics: topics.length,
        topics: topics,
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;

      const downloadAnchor = document.createElement('a');
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `ebbinghaus-backup-${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      console.error('Download backup error', e);
    }
  };

  // Handler to read and import JSON backup file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Check if structure matches
        let items: TopicItem[] = [];
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (parsed && Array.isArray(parsed.topics)) {
          items = parsed.topics;
        } else {
          throw new Error('ساختار فایل JSON معتبر نیست.');
        }

        // Basic validation
        const validItems = items.filter((item) => item.id && item.title && item.initialDate);
        if (validItems.length === 0 && items.length > 0) {
          throw new Error('مطالبی با ساختار معتبر در فایل یافت نشد.');
        }

        onRestoreTopics(validItems);
        setImportedCount(validItems.length);
        setImportStatus('success');
        setErrorMessage('');
      } catch (err: any) {
        setImportStatus('error');
        setErrorMessage(err.message || 'خطا در باز کردن فایل JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      id="backup-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="backup-modal"
        className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden my-6 transition-all"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">پشتیبان‌گیری و ذخیره اطلاعات</h2>
              <p className="text-xs text-slate-500">
                دریافت خروجی JSON از تمامی مطالب و سابقه مرورها
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Download Backup Section */}
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/80 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <FileDown className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  دانلود فایل پشتیبان (خروجی JSON)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  تمامی مطالب ({toPersianDigits(topics.length)} مورد)، برچسب‌ها، تاریخ‌های ثبت و سابقه مرورهای شما در قالب یک فایل متنی JSON استاندارد دانلود می‌شود تا بتوانید آن را در هر دستگاهی نگهداری یا بازیابی کنید.
                </p>
              </div>
            </div>

            <button
              onClick={handleDownloadBackup}
              id="download-backup-json-btn"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs shadow-blue-600/30 transition-all active:scale-98"
            >
              <Download className="w-4 h-4" />
              <span>دانلود فایل پشتیبان (JSON)</span>
            </button>
          </div>

          {/* Import / Restore Section */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  بازیابی از فایل پشتیبان (Import)
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  اگر قبلاً فایل پشتیبان JSON ذخیره کرده‌اید یا قصد انتقال اطلاعات به دستگاه دیگری را دارید، فایل خود را در این قسمت بارگذاری نمایید.
                </p>
              </div>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium transition-colors"
            >
              <FileJson className="w-4 h-4 text-blue-600" />
              <span>انتخاب فایل JSON پشتیبان...</span>
            </button>

            {/* Status Feedback */}
            {importStatus === 'success' && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  تعداد {toPersianDigits(importedCount)} مطلب با موفقیت از فایل پشتیبان بازیابی شد.
                </span>
              </div>
            )}

            {importStatus === 'error' && (
              <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-200/70 rounded-xl transition-colors"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
