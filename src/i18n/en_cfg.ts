// Automatically mirrors src/locales/en.cfg
const enRaw = `
# Metadata
lang_code = en
lang_name = English
dir = ltr

# App Branding
app_name = CarBook
app_tagline = Smart Vehicle Maintenance & Fuel Consumption Log
app_welcome_title = Welcome to CarBook
app_welcome_desc = Start by adding your vehicle to track fuel efficiency, scheduled service intervals, and smart odometer alerts.
app_add_first_car = Add Your Vehicle Now
app_no_vehicles = No vehicles added yet
app_select_prompt = Please add or select a vehicle to get started

# Navigation
nav_current_vehicle = Current Vehicle
nav_add_vehicle = Add
nav_overview = Dashboard
nav_fuel = Fuel Logs & Efficiency
nav_maintenance = Maintenance & Service
nav_alerts = Service Intervals & Alerts
nav_manual = OEM Vehicle Manual
nav_doctor = AI Car Doctor
nav_report = Vehicle Health Report
nav_settings = Settings & AI Config

# Top Header Actions
btn_add_fuel = Log Fuel Fill
btn_add_maintenance = Log Service / Oil
header_odometer = Current Odo:
header_plate = Plate:
header_no_plate = No Plate
unit_km = km
unit_egp = EGP
unit_currency = EGP
unit_liter = L
unit_l_per_100km = L/100km

# Overview Tab
ov_current_odometer = Current Odometer
ov_avg_consumption = Average Fuel Consumption
ov_calculating = Calculating
ov_total_fuel_cost = Total Fuel Expenses
ov_total_maint_cost = Total Maintenance Expenses
ov_upcoming_alerts = Upcoming Service Schedule
ov_view_all = View All
ov_recent_fuel = Recent Fuel Logs
ov_recent_maint = Recent Maintenance Records
ov_full_tank = Full Tank
ov_partial_tank = Partial Tank
ov_no_logs_yet = No records logged yet

# Fuel Tab
fuel_title = Fuel Fill Records & Efficiency Log
fuel_desc = Accurate calculation of L/100km and cost per kilometer between consecutive fill-ups
fuel_btn_new = Log New Fuel Fill
fuel_btn_export_excel = Export to Excel (.xlsx)
fuel_th_date = Date
fuel_th_odometer = Odometer
fuel_th_liters = Quantity
fuel_th_price_per_l = Price / L
fuel_th_total_cost = Total Paid
fuel_th_type = Fill Type
fuel_th_consumption = Consumption (L/100km)
fuel_th_cost_per_km = Cost / km
fuel_th_notes = Notes
fuel_th_actions = Actions
fuel_full_badge = Full Tank
fuel_partial_badge = Partial
fuel_na = N/A
fuel_empty_state = No fuel fills logged for this vehicle yet.

# Maintenance Tab
maint_title = Maintenance, Spare Parts & Oil Log
maint_desc = Complete log of all service invoices with breakdown of parts (New / OEM Import) and labor
maint_btn_new = Log New Maintenance
maint_btn_export_excel = Export to Excel (.xlsx)
maint_th_date = Date
maint_th_odometer = Odometer
maint_th_service = Service Description
maint_th_parts_detail = Spare Parts Breakdown
maint_th_workshop = Workshop / Service Center
maint_th_costs = Costs (Parts + Labor)
maint_th_total = Total Amount
maint_th_actions = Actions
maint_parts_count = parts
maint_labor = Labor
maint_cond_new = New / OEM
maint_cond_used = Used / Import
maint_empty_state = No maintenance records logged for this vehicle yet.

# Schedules & Alerts Tab
alerts_title = Preventive Maintenance Schedule & Alerts
alerts_desc = Smart mileage and time-based alerts to protect your vehicle from overdue service
alerts_filter_all = All
alerts_filter_urgent = Urgent / Overdue
alerts_filter_due_soon = Due Soon
alerts_status_ok = Good Condition
alerts_status_due_soon = Due Soon
alerts_status_overdue = Overdue Service!
alerts_interval = Interval:
alerts_last_done = Last performed at:
alerts_remaining = Remaining:
alerts_passed = Overdue by:
alerts_btn_edit_baseline = Set Baseline
alerts_btn_mark_done = Mark Done Now
alerts_modal_edit_title = Set Last Performed Maintenance
alerts_modal_odo_label = Last Done Odometer (km)
alerts_modal_date_label = Last Done Date
alerts_modal_interval_label = Maintenance Interval (km)
alerts_modal_save = Save
alerts_modal_cancel = Cancel
alerts_baseline_tip = No previous service recorded yet

# OEM Manual Tab
manual_title = Factory OEM Manual Specifications
manual_desc = Certified technical specifications for fluids, lubricants, tire pressure, and fuel for
manual_btn_fetch = Extract Factory Specs via AI
manual_btn_refresh = Refresh Specs via AI
manual_loading = Searching official factory service manuals...
manual_loading_sub = AI is reviewing certified engine oil viscosity, tank capacity, transmission fluid standard, coolant type, and tire pressure to save locally in your offline database.
manual_card_engine_oil = Engine Oil & Capacity
manual_field_oil_viscosity = Recommended Viscosity & Spec:
manual_field_oil_capacity = Oil Capacity (with filter):
manual_card_fluids = Drivetrain & Cooling Fluids
manual_field_trans_fluid = Transmission Fluid (ATF / CVT):
manual_field_coolant = Engine Coolant / Antifreeze:
manual_field_brake_fluid = Brake Fluid (DOT Spec):
manual_card_tire_pressure = Cold Tire Pressure
manual_field_tire_front = Front Tires:
manual_field_tire_rear = Rear Tires:
manual_card_fuel_ignition = Fuel & Ignition System
manual_field_tank_capacity = Fuel Tank Capacity:
manual_field_octane = Recommended Fuel Octane:
manual_field_spark_plugs = Spark Plugs:
manual_card_battery = Battery & Electrical System
manual_field_battery = Battery Specification:
manual_card_oem_tips = Manufacturer Service Guidelines
manual_empty_title = No OEM Specifications Extracted Yet
manual_empty_desc = Use AI to extract engine oil viscosity, fluid specifications, tire pressures, and tank capacity for your vehicle and store them locally for offline access anytime.
manual_empty_btn = Fetch OEM Specs Now
manual_not_specified = Not specified

# AI Car Doctor Tab
doc_title = AI Car Doctor Consultation
doc_desc = Consult the virtual master technician about symptoms, strange noises, OBD-II diagnostic fault codes, or preventive intervals based on your vehicle history
doc_input_label = Describe your symptom, noise, or trouble code:
doc_input_placeholder = Example: I hear a clicking sound when turning right at low speeds, or why is code P0420 showing? Or when should I replace the timing belt for my car?
doc_quick_title = Quick Inquiries:
doc_quick_1 = Light clicking sound on sharp turns
doc_quick_2 = Steering wheel vibration while braking
doc_quick_3 = Sluggish acceleration and power loss
doc_quick_4 = Best engine oil viscosity in high summer heat
doc_btn_submit = Ask AI Doctor
doc_btn_loading = Analyzing symptoms & service history...
doc_welcome_title = How Does AI Car Doctor Work?
doc_welcome_desc = The assistant cross-references your current odometer reading, past service records, and factory technical bulletins for your specific model to deliver a reliable, actionable diagnosis.
doc_your_query = Your Inquiry:
doc_advice_title = Master Technician Diagnosis & Recommendation:

# Report Tab
rep_title = Vehicle Health & Service History Report (Buyer / Owner)
rep_desc = Verified transparent record of odometer readings, service history, and replacement parts
rep_btn_print = Print Official Report / PDF
rep_btn_excel = Export Complete Dossier to Excel (.xlsx)
rep_btn_excel_maint = Export Maintenance to Excel
rep_btn_excel_fuel = Export Fuel Logs to Excel
rep_official_seal = Certified Inspection & Service Dossier generated by CarBook Local Engine
rep_sig_owner = Vehicle Owner Signature:
rep_sig_inspector = Inspection Authority / Center Seal:
rep_heading = Certified Vehicle Inspection & Maintenance Report
rep_date = Report Date:
rep_summary_odometer = Verified Odometer
rep_summary_oil = Recommended Engine Oil
rep_summary_total_maint = Total Verified Services
rep_table_title = Documented Service & Lubricant Records:
rep_th_date = Date
rep_th_odometer = Odometer
rep_th_service = Performed Service
rep_th_workshop = Workshop / Center
rep_th_cost = Cost
rep_th_notes = Notes

# Notifications
notif_title = Maintenance Device Notifications & Alerts
notif_desc = Enable real-time device notifications to get notified when vehicle maintenance is approaching or overdue
notif_status_enabled = Notifications are enabled on this device ✅
notif_status_disabled = Notifications are disabled 🔕
notif_status_unsupported = Notifications are not supported by this browser/device
notif_btn_enable = Enable Device Notifications
notif_btn_test = Send Test Notification 🔔
notif_test_sent = Test notification sent successfully!
notif_urgent_banner = Urgent Maintenance: You have service items due or overdue!
notif_view_alerts = View Alerts

# Settings Tab
set_title = System Settings & AI Configuration
set_fuel_pricing_title = Fuel Types & Pricing
set_fuel_pricing_desc = Define fuel grades and prices to automatically calculate liters and expenses on every new fill-up
set_fuel_add_btn = Add New Fuel Type
set_ai_title = AI Provider Configuration
set_ai_desc = Enter your Google Gemini or OpenRouter API key to automatically suggest oil grades, service intervals, and consult the AI Car Doctor. Keys are stored safely in your local database.
set_ai_provider = AI Provider
set_ai_key_label = API Key
set_ai_key_saved = Key configured:
set_ai_key_placeholder = Enter a new API key to update...
set_save_btn = Save Settings
set_save_success = Settings saved successfully!

# Modals - Add Vehicle Modal
modal_car_add_title = Add New Vehicle
modal_car_name_label = Vehicle Friendly Name (e.g. My Daily Driver)
modal_car_name_placeholder = My Daily Driver
modal_car_make = Make
modal_car_model = Model
modal_car_year = Year
modal_car_plate = License Plate (optional)
modal_car_init_odo = Initial Odometer (km)
modal_car_ai_box = Suggest Engine Oil & Service Schedule with AI
modal_car_ai_btn = Search & Suggest
modal_car_ai_loading = Searching...
modal_car_ai_found = Factory recommendations found
modal_car_ai_oil = Suggested Oil:
modal_car_ai_note = Preventive maintenance intervals will be automatically generated.
modal_car_oil_label = Recommended Engine Oil
modal_car_btn_save = Save Vehicle
modal_car_edit_title = Edit Vehicle Details
modal_car_btn_update = Update Vehicle
modal_car_engine_cc = Engine Displacement (CC / Liters)
modal_car_engine_cc_placeholder = e.g. 1600cc, 1.5 Turbo, or 2.0L
action_add_vehicle = Add Another Vehicle
btn_edit_vehicle = Edit Vehicle
btn_delete_vehicle = Delete Vehicle
confirm_delete_vehicle = Are you sure you want to delete this vehicle? All of its fuel and maintenance records will be deleted permanently.
detect_fuel_prices_btn = Auto-detect fuel prices by location
detect_fuel_prices_success = Fuel prices updated successfully for your region
country_select_label = Country / Region for Fuel Pricing

# Modals - Fuel Modal
modal_fuel_new_title = Log Fuel Fill
modal_fuel_edit_title = Edit Fuel Fill
modal_fuel_type_label = Fuel Grade (from Settings)
modal_fuel_liters_label = Fuel Quantity (Liters)
modal_fuel_price_label = Price per Liter
modal_fuel_total_label = Total Paid Amount
modal_fuel_full_tank_checkbox = Full Tank Fill (required for accurate L/100km calculation)
modal_fuel_notes_label = Notes (optional)
modal_fuel_btn_save = Save Fuel Fill
modal_fuel_btn_update = Update Fuel Fill

# Modals - Maintenance Modal
modal_maint_new_title = Log Maintenance / Oil Change
modal_maint_edit_title = Edit Maintenance Record
modal_maint_date = Date
modal_maint_odo = Odometer (km)
modal_maint_title_label = Service Description
modal_maint_title_placeholder = e.g. 10,000 km Full Synthetic Oil Change + OEM Oil Filter
modal_maint_parts_box_title = Spare Parts & Consumables Breakdown
modal_maint_add_part_btn = Add Spare Part
modal_maint_part_name = Part Name
modal_maint_part_cond_new = New / OEM Original
modal_maint_part_cond_used = Imported / Good Used
modal_maint_part_price = Price
modal_maint_parts_total_label = Total Parts Cost
modal_maint_labor_label = Labor Cost
modal_maint_total_label = Grand Total
modal_maint_workshop = Workshop / Service Center (optional)
modal_maint_next_odo = Target Odometer for Next Service (optional)
modal_maint_btn_save = Save Record
modal_maint_btn_update = Update Record

# Common Actions & Dialogs
btn_cancel = Cancel
btn_edit = Edit
btn_delete = Delete
btn_confirm = Confirm
btn_retry = Retry
confirm_delete_fuel = Are you sure you want to delete this fuel fill?
confirm_delete_maint = Are you sure you want to delete this maintenance record?
modal_make_model_required = Please enter the make and model first

# Loading / Error UI
load_error_title = Failed to load your data
load_error_desc = Check your connection or the server, then try again.

# Dashboard stat labels
dash_stat_odo = Odometer

# Alert statuses & counts (interpolated / plural)
alerts_overdue_by = Overdue by {km} km
alerts_due_soon_remaining = Due soon ({km} km remaining)
alerts_good_remaining = Good condition ({km} km remaining)
alerts_mark_done_success = Done!
rep_records_count__one = {count} record logged
rep_records_count__two = {count} records logged
rep_records_count__few = {count} records logged
rep_records_count__many = {count} records logged
rep_records_count__other = {count} records logged
notif_urgent_items__one = {count} item due
notif_urgent_items__two = {count} items due
notif_urgent_items__few = {count} items due
notif_urgent_items__many = {count} items due
notif_urgent_items__other = {count} items due

# Accessibility & auth labels
vehicle_actions_aria = Vehicle options
fab_add_entry_aria = Add entry
btn_login_google = Sign in with Google
btn_login_short = Login

# Maintenance modal derived total
modal_maint_total_derived_hint = Auto-calculated from parts + labor

# Sync status chip & auth handoff (mobile shell)
sync_ready = Ready
sync_local_only = Local only (no server)
sync_offline = Offline
sync_syncing = Syncing…
sync_synced = Synced (+{pushed}/↓{pulled})
sync_failed = Sync failed: {message}
handoff_login_failed = Login failed ({stage}: {reason})
handoff_session_ended = Session ended — sign in again
handoff_signin_required = Sign in to use this feature

# Settings card titles & account section (settings tab)
set_account_title = User Account & Cloud Sync
set_logged_in = Logged in
set_not_logged_in = Not logged in
set_sign_out = Sign out
set_login_desc = Sign in with your Google account to associate your vehicles with your account and sync data across devices securely.
set_backup_title = Backup & Restore
set_backup_desc = Download every vehicle and log as a single JSON file, and restore it on any device or after a reinstall.
set_backup_download = Download backup
set_backup_login_first = Sign in first to use backup and restore.
set_backup_restore_from_file = Restore from file
set_backup_unrecognised_file = Unrecognised file.
set_backup_restored = Restored: {count} rows.
set_backup_merge_title = Merge (safe)
set_backup_merge_desc = Adds back only what is missing; never overwrites anything you already have.
set_backup_replace_title = Full replace
set_backup_replace_desc = Deletes your current data and puts the file in its place. Cannot be undone.
set_backup_replace_ack = I understand that a full replace wipes the history on this account.
set_backup_restore_btn = Restore now
set_data_not_backed_up = Your data lives only on this device and is not backed up anywhere. A storage reset or an OS eviction would erase it permanently. Sign in to keep a server copy you can always restore.
set_data_waiting_upload = Waiting to upload: {count}. Your data is safe here and will reach the server automatically when you are back online.
set_data_backed_up = Backed up to your account. Sign-out or a reinstall can be undone by signing back in.
set_lang_title = App Language
set_lang_desc = CarBook supports multiple languages configured via simple .cfg files. Switch your language or easily drop new language files.
set_theme_title = App Theme
set_theme_desc = Pick one of four themes. Your choice is saved on this device and applied instantly across the app.
set_ai_badge = AI Ready & Server Managed (100% Free)
set_ai_desc = CarBook is equipped with a server-managed AI engine and automotive knowledge base that operates automatically for free. Providing your own API key is completely optional.
set_api_key_label = Personal API Key (Optional)
set_api_key_placeholder = Leave empty for automatic free mode, or paste custom key
set_new_fuel_name = New Fuel Grade
set_test_notif_sent_title = 🔔 CarBook Service Reminder
set_test_notif_sent_body = Test Alert: Engine oil change recommended soon!
set_enable_notif_title = 🚗 CarBook Notifications Activated
set_enable_notif_body = You will now receive alerts when maintenance service is approaching.
set_notif_perm_hint = Please enable notification permissions in your browser or device first.

# Reports tab additions
rep_total_costs = Total Service Costs
rep_oem_specs_title = OEM Technical & Fluid Specifications
rep_fetch_ai_btn = Fetch with AI
rep_no_records = No maintenance records logged yet
rep_tire_front_rear = Front: {front} | Rear: {rear}
rep_part_used = Used
rep_part_new = New
rep_oem_guidelines = 💡 Key OEM Guidelines:

# Maintenance modal service types
maint_service_type_label = Service Type
maint_type_oil = Oil & Filters Change
maint_type_periodic = Periodic Maintenance
maint_type_brakes = Brakes & Pads
maint_type_tires = Tires & Alignment
maint_type_repair = Mechanical Repair
maint_type_other = Other

# Fuel modal placeholders
fuel_select_grade = Select fuel grade...
fuel_custom_price = Custom price / other

# Schedules tab (mark-done confirm & edit hints)
sched_mark_done_confirm = Mark "{title}" as completed at {odo} km today?
sched_edit_odo_hint = Enter the car odometer reading when this service was last performed.

# Maintenance modal spare-parts empty state
maint_parts_empty = No spare parts added yet. Click "Add Spare Part" to detail components (New or OEM Import).

# Language short names (endonyms shown on the mobile language button)
lang_short_ar = عربي
lang_short_en = EN
lang_short_pl = PL

# Backup table labels and fuel name placeholder
set_backup_tbl_vehicles = vehicles
set_backup_tbl_schedules = schedules
set_backup_tbl_service_logs = service logs
set_backup_tbl_fuel_logs = fuel logs
set_fuel_name_placeholder = Gasoline 95 / بنزين 95

# Accessible labels and input examples
aria_dismiss = Dismiss
btn_change_language = Change language
ph_make_example = Toyota / Hyundai
ph_model_example = Corolla / Tucson
ph_station_note = Gas station / fuel note
ph_workshop = Official Service Center / Garage
ph_odo_example = e.g. 60000
ph_price = Price

# Failure toasts (a failed action must never read like a success)
err_request_failed = Request failed
err_delete_vehicle = Failed to delete vehicle
err_delete_fuel = Failed to delete fuel log
err_delete_maint = Failed to delete maintenance record

# Shared transport failure wording
err_http_status = Request failed ({status})
err_request_generic = Request failed

# 401 envelope message
err_session_expired = Session expired — please sign in again

# Schedules: items with no service record yet
alerts_status_needs_record = Service record required
alerts_needs_record_hint = No service has been logged for this item yet, so its due date cannot be calculated. Log the service, or use "Set last service" to enter the odometer manually.
alerts_last_done_none = Not recorded
alerts_link_badge = Linked to a service log
alerts_linked_from_log = Last done from the service log on {date} at {odo} km

# Schedules: adding and removing items
alerts_btn_add_item = Add maintenance item
alerts_add_item_title = Add a new preventive maintenance item
alerts_item_title_ar_label = Item name (Arabic)
alerts_item_title_en_label = Item name (English)
alerts_item_interval_km_label = Interval in kilometres
alerts_item_interval_months_label = Interval in months (optional)
alerts_item_add = Add
alerts_item_added = Item added to the schedule
alerts_item_invalid = Enter an item name and a kilometre interval greater than zero
alerts_item_badge_custom = Custom item
alerts_btn_delete_item = Remove item
alerts_delete_item_confirm = Remove "{title}" from the preventive maintenance schedule?
alerts_item_deleted = Item removed

# Maintenance log linked to preventive items
maint_linked_schedules = {count} schedule items were updated automatically from this log
alerts_filter_needs_record = Not recorded yet
maint_linked_item_label = Linked preventive item
maint_linked_item_auto = Automatic from the service type

# Header, account and menus
nav_account = Account
aria_open_menu = Open menu
menu_signed_in_as = Signed in as {name}

# Language menu
lang_menu_title = Change language
aria_language_menu = Available languages
lang_menu_hint = The chosen language applies to the interface and to the AI doctor answers.

# Sync chip details and automatic sync
sync_tap_hint = Tap to see sync details
sync_details_title = Sync status
sync_collapse = Hide details
sync_last_at = Last sync: {time}
sync_pending = Items waiting to upload: {count}
sync_btn_now = Sync now
sync_auto_note = Automatic sync runs after every addition or edit and when the connection returns.

# APK update channel
update_available_title = New update available ({version})
update_available_body = A new CarBook release is available. Download and install the APK to get the latest fixes.
update_btn_download = Download update
update_btn_later = Later
update_up_to_date = The app is up to date ({version})
update_check_failed = Could not check for an update
update_check_btn = Check for updates
update_current_version = Installed version: {version}

# Native Android notifications
notif_channel_name = CarBook maintenance alerts
notif_status_native = System notifications are enabled on this device
notif_status_web = Browser notifications
notif_native_permission_denied = Notification permission is denied on this device. Enable it in system settings, then restart the app.
notif_btn_enable_system = Enable system notifications
`;

export default enRaw;
