// Automatically mirrors src/locales/ar.cfg
const arRaw = `
# Metadata
lang_code = ar
lang_name = العربية
dir = rtl

# App Branding
app_name = CarBook
app_tagline = دفتر ومتابعة صيانة واستهلاك السيارة
app_welcome_title = مرحباً بك في CarBook
app_welcome_desc = ابدأ بإضافة سيارتك لمتابعة استهلاك الوقود وجدول الصيانات والتنبيهات الدورية لقراءة العداد.
app_add_first_car = إضافة سيارتك الآن
app_no_vehicles = لا توجد سيارات بعد
app_select_prompt = يرجى إضافة أو اختيار سيارة للبدء

# Navigation
nav_current_vehicle = السيارة الحالية
nav_add_vehicle = إضافة
nav_overview = لوحة التحكم العامة
nav_fuel = سجل التفويل واستهلاك البنزين
nav_maintenance = سجل الصيانات وتغيير الزيت
nav_alerts = جدول الصيانة والتنبيهات
nav_manual = كتالوج ومواصفات السيارة
nav_doctor = استشارة مهندس الصيانة (AI)
nav_report = تقرير الفحص والبيع
nav_settings = إعدادات النظام وذكاء AI

# Top Header Actions
btn_add_fuel = تسجيل تفويلة
btn_add_maintenance = تسجيل صيانة / زيت
header_odometer = العداد الحالي:
header_plate = لوحة:
header_no_plate = بدون لوحة
unit_km = كم
unit_egp = جنيه
unit_currency = ج.م
unit_liter = لتر
unit_l_per_100km = لتر/100كم

# Overview Tab
ov_current_odometer = العداد الحالي
ov_avg_consumption = متوسط استهلاك الوقود
ov_calculating = تحت الحساب
ov_total_fuel_cost = إجمالي مصاريف البنزين
ov_total_maint_cost = إجمالي مصاريف الصيانة
ov_upcoming_alerts = حالة الصيانات الدورية القادمة
ov_view_all = عرض الكل
ov_recent_fuel = آخر التفويلات المسجلة
ov_recent_maint = آخر عمليات الصيانة
ov_full_tank = تفويلة كاملة
ov_partial_tank = تفويلة جزئية
ov_no_logs_yet = لم يتم تسجيل أي بيانات بعد

# Fuel Tab
fuel_title = سجل استهلاك الوقود والتفويلات
fuel_desc = حساب دقيق لاستهلاك اللتر/100كم وتكلفة الكيلومتر بين كل تفويلتين
fuel_btn_new = تسجيل تفويلة جديدة
fuel_btn_export_excel = تصدير إلى Excel (.xlsx)
fuel_th_date = التاريخ
fuel_th_odometer = قراءة العداد
fuel_th_liters = الكمية
fuel_th_price_per_l = سعر اللتر
fuel_th_total_cost = الإجمالي المدفوع
fuel_th_type = نوع التفويلة
fuel_th_consumption = الاستهلاك (L/100KM)
fuel_th_cost_per_km = تكلفة الكيلومتر
fuel_th_notes = ملاحظات
fuel_th_actions = إجراءات
fuel_full_badge = تفويلة كاملة
fuel_partial_badge = جزئية
fuel_na = غير متاح
fuel_empty_state = لا توجد تفويلات مسجلة لهذه السيارة حتى الآن.

# Maintenance Tab
maint_title = سجل الصيانات وقطع الغيار وتغيير الزيت
maint_desc = توثيق متكامل لكل فواتير الصيانة مع تفصيل قطع الغيار (جديد / استيراد) والمصنعية
maint_btn_new = تسجيل صيانة جديدة
maint_btn_export_excel = تصدير إلى Excel (.xlsx)
maint_th_date = التاريخ
maint_th_odometer = قراءة العداد
maint_th_service = بيان الخدمة / الصيانة
maint_th_parts_detail = تفاصيل قطع الغيار
maint_th_workshop = الورشة / المركز
maint_th_costs = التكاليف (قطع + مصنعية)
maint_th_total = الإجمالي الكلي
maint_th_actions = إجراءات
maint_parts_count = قطع
maint_labor = مصنعية
maint_cond_new = جديد
maint_cond_used = استيراد
maint_empty_state = لا توجد عمليات صيانة مسجلة لهذه السيارة بعد.

# Schedules & Alerts Tab
alerts_title = جدول الصيانة الوقائية والتنبيهات
alerts_desc = تنبيهات ذكية مبنية على قراءة العداد والمدة الزمنية الموصى بها
alerts_filter_all = الكل
alerts_filter_urgent = حرجة ومتأخرة
alerts_filter_due_soon = مستحقة قريباً
alerts_status_ok = الحالة جيدة
alerts_status_due_soon = مستحق قريباً
alerts_status_overdue = متأخرة وتجاوزت الموعد!
alerts_interval = الفاصل الدوري:
alerts_last_done = آخر إجراء تم عند عداد:
alerts_remaining = المتبقي:
alerts_passed = تم التجاوز بـ:
alerts_btn_edit_baseline = ضبط آخر صيانة
alerts_btn_mark_done = تمت الصيانة الآن
alerts_modal_edit_title = ضبط بيانات آخر صيانة
alerts_modal_odo_label = قراءة العداد عند آخر تغيير (كم)
alerts_modal_date_label = تاريخ آخر تغيير
alerts_modal_interval_label = الفاصل الدوري بالكيلومتر
alerts_modal_save = حفظ التعديل
alerts_modal_cancel = إلغاء
alerts_baseline_tip = لم تُسجل صيانة سابقة لهذا البند بعد

# OEM Manual Tab
manual_title = كتالوج ومواصفات المصنع الأصلية (OEM Specs)
manual_desc = المواصفات الفنية المعتمدة للزيوت، السوائل، ضغوط الإطارات، ونوع الوقود حسب توصية الصانع لـ
manual_btn_fetch = استخراج كتالوج السيارة بالذكاء الاصطناعي
manual_btn_refresh = تحديث المواصفات بالذكاء الاصطناعي
manual_loading = جاري فحص واستخراج كتالوج المصنع المعتمد...
manual_loading_sub = يقوم الذكاء الاصطناعي بمراجعة مواصفات لزوجة زيت المحرك، سعة التانك، نوع زيت الفتيس، سائل التبريد، وضغوط الإطارات لحفظها محلياً في قاعدة البيانات.
manual_card_engine_oil = زيت المحرك والسعة
manual_field_oil_viscosity = اللزوجة والمواصفة المعتمدة:
manual_field_oil_capacity = سعة الزيت (مع تغيير الفلتر):
manual_card_fluids = سوائل الحركة والتبريد
manual_field_trans_fluid = زيت ناقل الحركة (الفتيس/الجير):
manual_field_coolant = سائل التبريد (مياه الردياتير):
manual_field_brake_fluid = سائل الفرامل (Brake Fluid):
manual_card_tire_pressure = ضغط هواء الإطارات (بارد)
manual_field_tire_front = ضغط العجلات الأمامية:
manual_field_tire_rear = ضغط العجلات الخلفية:
manual_card_fuel_ignition = منظومة الوقود والاشتعال
manual_field_tank_capacity = سعة خزان الوقود (التانك):
manual_field_octane = نوع وأوكتان البنزين الموصى به:
manual_field_spark_plugs = شمعات الاشتعال (البوجيهات):
manual_card_battery = البطارية والنظام الكهربائي
manual_field_battery = مواصفة البطارية المعتمدة:
manual_card_oem_tips = إرشادات وتوصيات الشركة الصانعة
manual_empty_title = لم يتم استخراج كتالوج ومواصفات السيارة بعد
manual_empty_desc = استخدم الذكاء الاصطناعي لجلب لزوجة زيت المحرك، سعة التانك، نوع زيت الفتيس، مياه الردياتير، وضغط الإطارات وحفظها محلياً للمراجعة في أي وقت بدون إنترنت.
manual_empty_btn = جلب كتالوج ومواصفات المصنع الآن
manual_not_specified = غير محدد

# AI Car Doctor Tab
doc_title = استشارة مهندس الصيانة المساعد (AI Car Doctor)
doc_desc = استشر مهندس الصيانة حول أي عطل، أصوات غريبة، رموز أعطال OBD-II، أو مواعيد الصيانة الوقائية بناءً على تاريخ سيارتك
doc_input_label = اكتب سؤالك أو صف المشكلة والأعراض أو كود العطل:
doc_input_placeholder = مثال: أسمع صوت طقطقة مع الملفات لليمين على سرعة بطيئة، أو ما سبب إضاءة لمبة المحرك مع كود P0420؟ أو متى يجب تغيير سير الكاتينة لسيارتي؟
doc_quick_title = أسئلة سريعة:
doc_quick_1 = صوت طقطقة خفيف مع الملفات
doc_quick_2 = اهتزاز أو رجة في الدركسيون مع الفرامل
doc_quick_3 = ضعف عزم السيارة وتأخر التسارع
doc_quick_4 = أفضل لزوجة زيت محرك في الصيف والحرارة العالية
doc_btn_submit = إرسال الاستشارة
doc_btn_loading = جاري تحليل الأعراض والصيانات...
doc_welcome_title = كيف يساعدك مهندس الصيانة المساعد؟
doc_welcome_desc = يقوم الذكاء الاصطناعي بربط استفسارك بقراءة عداد السيارة الحالية، وتاريخ الصيانات المسجلة، والمواصفات المصنعية ونقاط الضعف الشائعة لموديل سيارتك لتقديم تشخيص دقيق ومباشر.
doc_your_query = سؤالك:
doc_advice_title = تشخيص وتوصية مهندس الصيانة:

# Report Tab
rep_title = تقرير الفحص وتاريخ صيانة السيارة (مخصص للمشتري والمالك)
rep_desc = سجل شفاف معتمد لقراءة العداد وتاريخ الصيانات وقطع الغيار
rep_btn_print = طباعة تقرير رسمي / PDF
rep_btn_excel = تصدير كامل البيانات إلى Excel (.xlsx)
rep_btn_excel_maint = تصدير الصيانة إلى Excel
rep_btn_excel_fuel = تصدير البنزين إلى Excel
rep_official_seal = تقرير فحص وصيانة موثق صادر من نظام CarBook المحلي
rep_sig_owner = توقيع مالك المركبة:
rep_sig_inspector = اعتماد الفحص / المركز:
rep_heading = تقرير الفحص والصيانة الدوري للسيارة
rep_date = تاريخ التقرير:
rep_summary_odometer = قراءة العداد المثبتة
rep_summary_oil = نوع الزيت الموصى به
rep_summary_total_maint = إجمالي عمليات الصيانة المثبتة
rep_table_title = سجل الصيانة وتغيير الزيوت الموثق:
rep_th_date = التاريخ
rep_th_odometer = العداد
rep_th_service = الخدمة المنفذة
rep_th_workshop = الورشة / المركز
rep_th_cost = التكلفة
rep_th_notes = ملاحظات

# Notifications
notif_title = إشعارات وتنبيهات الصيانة على الجهاز
notif_desc = تفعيل التنبيهات المباشرة على الموبايل أو المتصفح عند اقتراب مواعيد الصيانة الوقائية
notif_status_enabled = الإشعارات مفعلة على هذا الجهاز ✅
notif_status_disabled = الإشعارات غير مفعلة 🔕
notif_status_unsupported = المتصفح أو الجهاز لا يدعم الإشعارات المباشرة
notif_btn_enable = تفعيل إشعارات الجهاز
notif_btn_test = إرسال إشعار تجريبي 🔔
notif_test_sent = تم إرسال الإشعار التجريبي بنجاح!
notif_urgent_banner = تنبيه صيانة عاجلة: يوجد بنود صيانة مستحقة أو متأخرة لهذه السيارة!
notif_view_alerts = عرض التنبيهات

# Settings Tab
set_title = إعدادات النظام وذكاء AI
set_fuel_pricing_title = أنواع وأسعار الوقود
set_fuel_pricing_desc = حدد أسعار وأنواع الوقود ليتم استخدامها تلقائياً واحتساب التكاليف واللترات عند كل تفويلة جديدة
set_fuel_add_btn = إضافة نوع وقود جديد
set_ai_title = إعدادات الذكاء الاصطناعي (AI Provider)
set_ai_desc = يمكنك إدخال مفتاح API لـ Google Gemini أو OpenRouter لجلب التوصيات الخاصة بنوع الزيت وجدول الصيانات الدوري المناسب لموديل سيارتك تلقائياً. المفتاح محفوظ محلياً بأمان ولا يتم مشاركته أبداً.
set_ai_provider = مزود الخدمة
set_ai_key_label = مفتاح الـ API
set_ai_key_saved = تم حفظ المفتاح:
set_ai_key_placeholder = أدخل مفتاح جديد لتحديثه...
set_save_btn = حفظ الإعدادات
set_save_success = تم حفظ الإعدادات بنجاح

# Modals - Add Vehicle Modal
modal_car_add_title = إضافة سيارة جديدة
modal_car_name_label = اسم تعريفي للسيارة (مثال: سيارتي اليومية / سيارة العائلة)
modal_car_name_placeholder = سيارتي اليومية
modal_car_make = الماركة (Make)
modal_car_model = الموديل (Model)
modal_car_year = سنة الصنع
modal_car_plate = رقم اللوحة (اختياري)
modal_car_init_odo = قراءة العداد الابتدائية (كم)
modal_car_ai_box = اقتراح نوع الزيت وجدول الصيانة بالذكاء الاصطناعي
modal_car_ai_btn = بحث واقتراح
modal_car_ai_loading = جاري البحث...
modal_car_ai_found = تم العثور على توصيات لموديل سيارتك
modal_car_ai_oil = الزيت المقترح:
modal_car_ai_note = سيتم تهيئة جدول الصيانة الدوري تلقائياً بناءً على مواصفات الموديل.
modal_car_oil_label = نوع الزيت الموصى به
modal_car_btn_save = حفظ السيارة
modal_car_edit_title = تعديل بيانات السيارة
modal_car_btn_update = تحديث بيانات السيارة
modal_car_engine_cc = سعة المحرك (CC / لتر)
modal_car_engine_cc_placeholder = مثال: 1600cc أو 1.5 Turbo أو 2.0L
action_add_vehicle = إضافة سيارة أخرى
btn_edit_vehicle = تعديل السيارة
btn_delete_vehicle = حذف السيارة
confirm_delete_vehicle = هل أنت متأكد من حذف هذه السيارة؟ سيتم حذف جميع سجلات الوقود والصيانة الخاصة بها نهائياً.
detect_fuel_prices_btn = تحديد أسعار الوقود تلقائياً حسب موقعي
detect_fuel_prices_success = تم تحديث أسعار الوقود بنجاح وفقاً لموقعك
country_select_label = الدولة / المنطقة لأسعار الوقود

# Modals - Fuel Modal
modal_fuel_new_title = تسجيل تفويلة بنزين
modal_fuel_edit_title = تعديل تفويلة بنزين
modal_fuel_type_label = نوع الوقود (مسجل في الإعدادات)
modal_fuel_liters_label = كمية الوقود (لتر)
modal_fuel_price_label = سعر اللتر (جنيه)
modal_fuel_total_label = إجمالي التكلفة / المبلغ المدفوع (جنيه)
modal_fuel_full_tank_checkbox = تفويلة كاملة (لحساب استهلاك اللتر/100كم بدقة)
modal_fuel_notes_label = ملاحظات (اختياري)
modal_fuel_btn_save = تسجيل التفويلة
modal_fuel_btn_update = تحديث التفويلة

# Modals - Maintenance Modal
modal_maint_new_title = تسجيل صيانة / تغيير زيت
modal_maint_edit_title = تعديل صيانة / تغيير زيت
modal_maint_date = التاريخ
modal_maint_odo = قراءة العداد (كم)
modal_maint_title_label = بيان الصيانة
modal_maint_title_placeholder = مثال: تغيير زيت المحرك 10,000 كم + فلتر الزيت الأصلي
modal_maint_parts_box_title = تفصيل قطع الغيار والمستهلكات
modal_maint_add_part_btn = إضافة قطعة غيار
modal_maint_part_name = اسم القطعة
modal_maint_part_cond_new = جديد أصلي / معتمد
modal_maint_part_cond_used = استيراد / مستعمل بحالة جيدة
modal_maint_part_price = السعر
modal_maint_parts_total_label = إجمالي قطع الغيار
modal_maint_labor_label = المصنعية (جنيه)
modal_maint_total_label = الإجمالي الكلي (جنيه)
modal_maint_workshop = الورشة / المركز (اختياري)
modal_maint_next_odo = العداد المستهدف للصيانة القادمة (اختياري)
modal_maint_btn_save = حفظ الصيانة
modal_maint_btn_update = تحديث الصيانة

# Common Actions & Dialogs
btn_cancel = إلغاء
btn_edit = تعديل
btn_delete = حذف
btn_confirm = تأكيد
btn_retry = إعادة المحاولة
confirm_delete_fuel = هل أنت متأكد من حذف هذه التفويلة؟
confirm_delete_maint = هل أنت متأكد من حذف هذا السجل؟
modal_make_model_required = يرجى إدخال الماركة والموديل أولاً

# Loading / Error UI
load_error_title = تعذر تحميل بياناتك
load_error_desc = تحقق من الاتصال أو السيرفر ثم أعد المحاولة.

# Dashboard stat labels
dash_stat_odo = العداد

# Alert statuses & counts (interpolated / plural)
alerts_overdue_by = متأخرة بـ {km} كم
alerts_due_soon_remaining = مستحق قريباً (متبقي {km} كم)
alerts_good_remaining = الحالة جيدة (متبقي {km} كم)
alerts_mark_done_success = تم بنجاح!
rep_records_count__one = عملية واحدة مسجلة
rep_records_count__two = عمليتان مسجلتان
rep_records_count__few = {count} عمليات مسجلة
rep_records_count__many = {count} عملية مسجلة
rep_records_count__other = {count} عملية مسجلة
notif_urgent_items__one = بند واحد مستحق
notif_urgent_items__two = بندَان مستحقان
notif_urgent_items__few = {count} بنود مستحقة
notif_urgent_items__many = {count} بنداً مستحقاً
notif_urgent_items__other = {count} بند مستحق

# Accessibility & auth labels
vehicle_actions_aria = خيارات السيارة
fab_add_entry_aria = إضافة سجل جديد
btn_login_google = دخول بحساب جوجل
btn_login_short = دخول

# Maintenance modal derived total
modal_maint_total_derived_hint = محسوب تلقائياً من قطع الغيار + المصنعية

# Sync status chip & auth handoff (mobile shell)
sync_ready = جاهز
sync_local_only = وضع محلي (بدون سيرفر)
sync_offline = غير متصل
sync_syncing = جارٍ المزامنة…
sync_synced = تمت المزامنة (+{pushed}/↓{pulled})
sync_failed = فشل المزامنة: {message}
handoff_login_failed = فشل تسجيل الدخول ({stage}: {reason})
handoff_session_ended = انتهت الجلسة — سجّل الدخول مجدداً
handoff_signin_required = تسجيل الدخول مطلوب لهذه الميزة

# Settings card titles & account section (settings tab)
set_account_title = حساب المستخدم والمزامنة السحابية
set_logged_in = مسجل الدخول
set_not_logged_in = غير مسجل
set_sign_out = تسجيل الخروج
set_login_desc = قم بتسجيل الدخول بحساب Google لربط سياراتك تلقائياً بحسابك وحفظ بياناتك وسجلاتك ومزامنتها بأمان عبر السيرفر والهاتف.
set_backup_title = النسخة الاحتياطية واستعادة البيانات
set_backup_desc = نزّل نسخة كاملة من سياراتك وسجلاتها كملف JSON واحد. استعِده على أي جهاز أو بعد إعادة تثبيت التطبيق.
set_backup_download = تنزيل نسخة احتياطية
set_backup_login_first = سجّل الدخول أولاً لاستخدام النسخ الاحتياطي.
set_backup_restore_from_file = استعادة من ملف
set_backup_unrecognised_file = ملف غير معروف.
set_backup_restored = تمت الاستعادة: {count} سجل.
set_backup_merge_title = دمج (آمن)
set_backup_merge_desc = يضيف ما فقدته فقط ويترك كل ما هو موجود حالياً كما هو.
set_backup_replace_title = استبدال كامل
set_backup_replace_desc = يحذف بياناتك الحالية ويستبدلها بمحتوى الملف. لا يمكن التراجع.
set_backup_replace_ack = أفهم أن الاستبدال الكامل سيمسح سجلاتي الحالية على هذا الحساب.
set_backup_restore_btn = استعادة الآن
set_lang_title = لغة التطبيق (App Language)
set_lang_desc = يدعم CarBook نظام اللغات المتعددة عبر ملفات .cfg البسيطة. يمكنك التبديل بين اللغات أو إضافة لغة جديدة بسهولة.
set_theme_title = مظهر التطبيق (Theme)
set_theme_desc = اختر أحد المظاهر الأربعة. يتم حفظ اختيارك على هذا الجهاز ويُطبَّق فوراً على كامل التطبيق.
set_ai_badge = الذكاء الاصطناعي مُدار وجاهز (مجاني 100%)
set_ai_desc = تطبيق CarBook مجهّز بمحرك ذكاء اصطناعي وقاعدة بيانات هندسية مُدارة من السيرفر تعمل مجاناً وتلقائياً. إدخال مفتاح API خاص بك هو خيار إضافي اختياري تماماً.
set_api_key_label = مفتاح API الخاص بك (اختياري)
set_api_key_placeholder = اتركه فارغاً للاستخدام المجاني التلقائي أو أدخل مفتاحك
set_new_fuel_name = نوع وقود جديد
set_test_notif_sent_title = 🔔 تذكير صيانة من CarBook
set_test_notif_sent_body = إشعار تجريبي: اقترب موعد تغيير زيت المحرك وفحص الفلاتر!
set_enable_notif_title = 🚗 تم تفعيل إشعارات CarBook
set_enable_notif_body = ستصلك الآن تنبيهات دورية عند اقتراب مواعيد الصيانة وتغيير الزيوت.
set_notif_perm_hint = يرجى السماح بالإشعارات من إعدادات المتصفح أو الجهاز أولاً.

# Reports tab additions
rep_total_costs = إجمالي تكاليف الصيانة
rep_oem_specs_title = المواصفات الفنية وسوائل المحرك المعتمدة
rep_fetch_ai_btn = جلب بذكاء الاصطناعي
rep_no_records = لا توجد سجلات صيانة مسجلة حتى الآن
rep_tire_front_rear = أمام: {front} | خلف: {rear}
rep_part_used = استيراد
rep_part_new = جديد
rep_oem_guidelines = 💡 إرشادات وتوصيات المصنع:

# Maintenance modal service types
maint_service_type_label = نوع الخدمة
maint_type_oil = تغيير زيت وفلاتر
maint_type_periodic = صيانة دورية
maint_type_brakes = فرامل وتيل
maint_type_tires = إطارات وضبط زوايا
maint_type_repair = إصلاح عطل
maint_type_other = أخرى

# Fuel modal placeholders
fuel_select_grade = اختر نوع الوقود...
fuel_custom_price = سعر مخصص / نوع آخر

# Schedules tab (mark-done confirm & edit hints)
sched_mark_done_confirm = هل تود تأكيد إتمام صيـانة "{title}" الآن عند قراءة العداد: {odo} كم؟
sched_edit_odo_hint = أدخل قراءة عداد السيارة عند آخر مرة قمت فيها بعمل هذه الصيانة.

# Maintenance modal spare-parts empty state
maint_parts_empty = لم تتم إضافة قطع غيار بعد. اضغط "إضافة قطعة غيار" لتفصيل القطع (جديدة أو استيراد).

# Language short names (endonyms shown on the mobile language button)
lang_short_ar = عربي
lang_short_en = EN
lang_short_pl = PL

# Backup table labels and fuel name placeholder
set_backup_tbl_vehicles = سيارات
set_backup_tbl_schedules = مواعيد صيانة
set_backup_tbl_service_logs = سجل صيانة
set_backup_tbl_fuel_logs = سجل وقود
set_fuel_name_placeholder = Gasoline 95 / بنزين 95

# Accessible labels and input examples
aria_dismiss = إغلاق
btn_change_language = تغيير اللغة
ph_make_example = تويوتا / هيونداي
ph_model_example = كورولا / توسان
ph_station_note = محطة وقود / ملاحظة
ph_workshop = مركز صيانة معتمد / ورشة
ph_odo_example = مثال: 60000
ph_price = السعر

# Failure toasts (a failed action must never read like a success)
err_request_failed = فشل الطلب
err_delete_vehicle = تعذر حذف السيارة
err_delete_fuel = تعذر حذف سجل الوقود
err_delete_maint = تعذر حذف سجل الصيانة

# Shared transport failure wording
err_http_status = فشل الطلب ({status})
err_request_generic = فشل الطلب

# 401 envelope message
err_session_expired = انتهت الجلسة — يرجى تسجيل الدخول مرة أخرى

# Schedules: items with no service record yet
alerts_status_needs_record = مطلوب تسجيل الصيانة
alerts_needs_record_hint = لا يوجد سجل صيانة لهذا البند بعد، لذلك لا يمكن حساب الاستحقاق. سجّل الصيانة أو اضغط «ضبط آخر صيانة» لإدخال القراءة يدوياً.
alerts_last_done_none = غير مسجّل
alerts_link_badge = مرتبط بسجل صيانة
alerts_linked_from_log = آخر إجراء تم من سجل الصيانة بتاريخ {date} عند عداد {odo} كم

# Schedules: adding and removing items
alerts_btn_add_item = إضافة بند صيانة
alerts_add_item_title = إضافة بند صيانة وقائية جديد
alerts_item_title_ar_label = اسم البند بالعربية
alerts_item_title_en_label = اسم البند بالإنجليزية
alerts_item_interval_km_label = الفاصل الدوري بالكيلومتر
alerts_item_interval_months_label = الفاصل الدوري بالشهور (اختياري)
alerts_item_add = إضافة
alerts_item_added = تم إضافة البند إلى الجدول
alerts_item_invalid = أدخل اسم البند وفاصل بالكيلومتر أكبر من صفر
alerts_item_badge_custom = بند مخصص
alerts_btn_delete_item = حذف البند
alerts_delete_item_confirm = هل تريد حذف بند «{title}» من جدول الصيانة الوقائية؟
alerts_item_deleted = تم حذف البند

# Maintenance log linked to preventive items
maint_linked_schedules = تم تحديث {count} من بنود الجدول تلقائياً من هذا السجل
alerts_filter_needs_record = غير مسجّلة بعد
maint_linked_item_label = بند الصيانة الوقائية المرتبط
maint_linked_item_auto = تلقائي حسب نوع الصيانة

# Header, account and menus
nav_account = الحساب
aria_open_menu = فتح القائمة
menu_signed_in_as = مسجّل الدخول باسم {name}

# Language menu
lang_menu_title = تغيير اللغة
aria_language_menu = قائمة اللغات المتاحة
lang_menu_hint = اللغة المختارة تُطبّق على الواجهة وعلى ردود مساعد الصيانة.

# Sync chip details and automatic sync
sync_tap_hint = اضغط لعرض تفاصيل المزامنة
sync_details_title = حالة المزامنة
sync_collapse = إخفاء التفاصيل
sync_last_at = آخر مزامنة: {time}
sync_pending = عناصر بانتظار الرفع: {count}
sync_btn_now = مزامنة الآن
sync_auto_note = المزامنة التلقائية تعمل بعد كل إضافة أو تعديل وعند عودة الاتصال.

# APK update channel
update_available_title = تحديث جديد متاح ({version})
update_available_body = صدر إصدار جديد من CarBook. حمّل الـ APK وثبّته للحصول على آخر التحسينات والإصلاحات.
update_btn_download = تحميل التحديث
update_btn_later = لاحقاً
update_up_to_date = البرنامج محدّث لآخر إصدار ({version})
update_check_failed = تعذّر التحقق من وجود تحديث
update_check_btn = التحقق من وجود تحديث
update_current_version = الإصدار المثبّت: {version}

# Native Android notifications
notif_channel_name = تنبيهات صيانة CarBook
notif_status_native = إشعارات النظام على الجهاز مفعّلة
notif_status_web = إشعارات المتصفح
notif_native_permission_denied = صلاحية الإشعارات مرفوضة على الجهاز. فعّلها من إعدادات النظام ثم أعد التشغيل.
notif_btn_enable_system = تفعيل إشعارات النظام
`;

export default arRaw;
