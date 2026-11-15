/* IntelliTwin interface language. English is written in index.html; this file adds Arabic for the
 * fixed labels (marked with data-i18n) and switches the page to right-to-left.
 * Sentences built from live values, the assistant and the docs remain in English.
 * The Arabic text should be reviewed by a native speaker before client use.
 */
(function () {
  'use strict';
  var AR = {
    tagline: 'ذكاء النقل في الوقت الفعلي والمحاكاة التنبؤية', gotoRoad: 'انتقل إلى طريق رئيسي…', wholeArea: 'منطقة الدراسة كاملة', alerts: 'التنبيهات',
    badge: 'توأم رقمي ذكي لمدن أكثر ذكاءً', live: 'مباشر', historical: 'تاريخي', sites: 'المواقع', dashboard: 'لوحة المعلومات', legend: 'مفتاح الخريطة',
    lgFree: 'انسيابي ≥80% من الحد', lgModerate: 'متوسط 60–80%', lgHeavy: 'مزدحم 40–60%', lgSevere: 'شديد الازدحام <40%',
    lgVehicles: 'المركبات (قرّب للعرض ثلاثي الأبعاد)', lgAccident: 'حادث (توضيحي)', lgSite: 'كاميرا ضبط (اصطناعية)', lgCam: 'كاميرا مراقبة',
    lgDet: 'كاشف مروري', lgVms: 'لوحة رسائل', lgSig: 'إشارة ضوئية (دورة عامة)', ask: 'مستشار التوأم', fullView: 'عرض كامل', orbit: 'دوران',
    minimise: 'تصغير', congestion: 'الازدحام', accidents: 'الحوادث', fines: 'المخالفات', devices: 'الأجهزة', reports: 'التقارير', model: 'النموذج',
    networkNow: 'الشبكة الآن', avgSpeed: 'متوسط السرعة', extraTime: 'زمن الرحلة الإضافي', vehMoving: 'المركبات المتحركة', delayHour: 'التأخير في الساعة',
    accToday: 'حوادث اليوم', finesToday: 'مخالفات اليوم', illustrative: 'توضيحي', forecast: 'التوقعات', forecastNote: 'من منحنى اليوم الاصطناعي',
    dayProfile: 'منحنى اليوم', speedKmh: 'سرعة الشبكة، كم/س', typical: 'الطلب المعتاد', selected: 'الحالة المختارة', shownTime: 'الوقت المعروض',
    scenarioLayers: 'السيناريو والطبقات', demandCase: 'حالة الطلب', vehicles: 'المركبات', lyEnf: 'كاميرات الضبط', lyCam: 'كاميرات المراقبة',
    lyDet: 'الكواشف', lyVms: 'لوحات الرسائل', lySig: 'الإشارات الضوئية', whatIf: 'ماذا لو: إغلاق طريق', roadToClose: 'الطريق المراد إغلاقه',
    congByClass: 'الازدحام حسب فئة الطريق', slowest: 'أبطأ الطرق الآن', tapLocate: 'اضغط لتحديد الموقع', today: 'اليوم', activeNow: 'نشط الآن',
    withInjury: 'مع إصابات', accLog: 'سجل الحوادث', value: 'القيمة', byType: 'حسب نوع المخالفة', busiestSites: 'أكثر مواقع الضبط نشاطاً',
    cameras: 'كاميرات المراقبة', signs: 'لوحات الرسائل', exports: 'التصدير', audit: 'سجل التدقيق', settings: 'الإعدادات'
  };
  var cfg = (window.IntelliTwin && window.IntelliTwin.core.CFG.language) || { default: 'en', available: ['en', 'ar'] }, lang = 'en';

  function apply(l) {
    lang = l;
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      if (!el.hasAttribute('data-en')) { el.setAttribute('data-en', el.textContent); }
      var key = el.getAttribute('data-i18n');
      el.textContent = l === 'ar' && AR[key] ? AR[key] : el.getAttribute('data-en');
    });
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    var btn = document.getElementById('langBtn');
    if (btn) { btn.textContent = l === 'ar' ? 'English' : 'عربي'; }
    try { localStorage.setItem('intellitwin.lang', l); } catch (e) { /* ignore */ }
  }

  function init() {
    var btn = document.getElementById('langBtn'), saved = null;
    try { saved = localStorage.getItem('intellitwin.lang'); } catch (e) { saved = null; }
    if (cfg.available.indexOf('ar') < 0) { if (btn) { btn.hidden = true; } return; }
    if (btn) { btn.addEventListener('click', function () { apply(lang === 'ar' ? 'en' : 'ar'); }); }
    apply(saved && cfg.available.indexOf(saved) >= 0 ? saved : cfg.default);
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
  window.IntelliTwinI18n = { apply: apply, lang: function () { return lang; } };
})();
