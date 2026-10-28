# وثيقة متطلبات المنتج (PRD)

**المشروع:** Car Maintenance Followup
**المراجعة:** 1 (DRAFT)
**التاريخ:** 2026-10-28T12:01:50.318Z

> [!NOTE]
> هذه النسخة العربية مطابقة لمرجع المواصفات الإنجليزية المعتمد (Revision 1).
> المعرفات البرمجية والمسارات وأسماء الواجهات البرمجية محفوظة بالإنجليزية لتوافق التنفيذ.

## 1. بيان المشكلة

المستخدم دايما بيسجل بيانات تغيير الزيت و الصيانات و بنزين العربية و التكلفة في برامج مختلفة
كمان المستخدم مش بيبقى عارف ايه الصيانات الدورية اللي ممكن تتعمل لموديل العربية بتاعته، و كمان مفيش تنبيه امتى التغيير او الصيانة قرب يتعمل "من خلال متابعة اخر تغيير مع قراءة العداد ODOMETER 

## 2. المستخدمون المستهدفون

اصحاب السيارات و المستخدمين، كمان الشخص اللي ممكن يشتري السيارة من مالك قديم من خلال تقارير مفصلة عن السيارة

## 3. النتيجة المرجوة

نظام بسيط و سلس عشان يقد المستخدم من خلاله يسجل التفويلات بتاعة البنزين و يبين استهلاك العربية للبنزين و كذلك توقيتات تغيير الزيت و عمل الصيانات اللازمة من خلال ما تم من ادخال سابق لاخر اجراء اتعمل، او تسجيل اول اجراء، كمان يبقى في تقارير تفصيلية و اجمالية عن الصيانات، البنزين، في تواريخ معينة و خلافه

## 4. الميزات والنطاق

### الميزات الأساسية للإصدار الأول
1. **MPV**: MPV working structure

### الاستثناءات الصريحة (خارج النطاق)

#### Deferred Features (Future Scope):
cloud integration
vps deployment
android version

## 5. القيود

#### 1. User-Reported Constraints & Facts:
- **User-Stated Narrative Constraints:** تشغيل محلي اولا و بعد كدة ممكن نعمل ابليكيشن على سرفر او برنامج اندرويد

#### 2. Derived Operational Constraints:
- **Derived Persistence Constraint:** Application state must be persisted locally in SQLite with ACID transaction safety across application restarts.

#### 3. Proposed Controls (Requiring Architecture Approval):
- **Proposed Storage Encryption Control (Requires Architectural Approval):** Local database encryption at rest should be evaluated if sensitive client or financial records are stored locally.
