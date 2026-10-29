// Polish automotive translations for CarBook
const plRaw = `
# Metadata
lang_code = pl
lang_name = Polski
dir = ltr

# App Branding
app_name = CarBook
app_tagline = Inteligentny dziennik serwisowy i rejestr spalania pojazdu
app_welcome_title = Witamy w CarBook
app_welcome_desc = Dodaj swój pojazd, aby monitorować zużycie paliwa, interwały serwisowe oraz otrzymywać inteligentne alerty przebiegu.
app_add_first_car = Dodaj swój pojazd
app_no_vehicles = Brak dodanych pojazdów
app_select_prompt = Dodaj lub wybierz pojazd, aby rozpocząć

# Navigation
nav_current_vehicle = Bieżący pojazd
nav_add_vehicle = Dodaj
nav_overview = Panel główny
nav_fuel = Tankowania i spalanie
nav_maintenance = Serwis i naprawy
nav_alerts = Terminy i alerty
nav_manual = Instrukcja OEM
nav_doctor = Doradca techniczny AI
nav_report = Raport pojazdu
nav_settings = Ustawienia i AI

# Top Header Actions
btn_add_fuel = Zarejestruj tankowanie
btn_add_maintenance = Zarejestruj serwis / olej
header_odometer = Przebieg:
header_plate = Tablica:
header_no_plate = Brak tablicy
unit_km = km
unit_egp = EGP
unit_currency = zł
unit_liter = l
unit_l_per_100km = l/100km

# Overview Tab
ov_current_odometer = Bieżący przebieg
ov_avg_consumption = Średnie zużycie paliwa
ov_calculating = Obliczanie...
ov_total_fuel_cost = Łączny koszt paliwa
ov_total_maint_cost = Łączny koszt serwisu
ov_upcoming_alerts = Nadchodzące czynności serwisowe
ov_view_all = Zobacz wszystkie
ov_recent_fuel = Ostatnie tankowania
ov_recent_maint = Ostatnie wpisy serwisowe
ov_full_tank = Do pełna
ov_partial_tank = Częściowe
ov_no_logs_yet = Brak zarejestrowanych wpisów

# Fuel Tab
fuel_title = Rejestr tankowań i zużycia paliwa
fuel_desc = Precyzyjne obliczanie l/100km oraz kosztu za kilometr między kolejnymi tankowaniami do pełna
fuel_btn_new = Nowe tankowanie
fuel_btn_export_excel = Eksportuj do Excela (.xlsx)
fuel_th_date = Data
fuel_th_odometer = Przebieg
fuel_th_liters = Ilość
fuel_th_price_per_l = Cena / l
fuel_th_total_cost = Suma
fuel_th_type = Rodzaj
fuel_th_consumption = Spalanie (l/100km)
fuel_th_cost_per_km = Koszt / km
fuel_th_notes = Notatki
fuel_th_actions = Akcje
fuel_full_badge = Do pełna
fuel_partial_badge = Częściowe
fuel_na = B/D
fuel_empty_state = Brak wpisów tankowań dla tego pojazdu.

# Maintenance Tab
maint_title = Historia serwisu, części i wymian oleju
maint_desc = Kompletny rejestr faktur i usług ze szczegółowym podziałem na części (nowe / OEM) oraz robociznę
maint_btn_new = Nowy wpis serwisowy
maint_btn_export_excel = Eksportuj do Excela (.xlsx)
maint_th_date = Data
maint_th_odometer = Przebieg
maint_th_service = Zakres czynności
maint_th_parts_detail = Wyszczególnienie części
maint_th_workshop = Warsztat / Serwis
maint_th_costs = Koszty (części + robocizna)
maint_th_total = Razem
maint_th_actions = Akcje
maint_parts_count = części
maint_labor = Robocizna
maint_cond_new = Nowa / OEM
maint_cond_used = Używana / Regenerowana
maint_empty_state = Brak wpisów serwisowych dla tego pojazdu.

# Schedules & Alerts Tab
alerts_title = Harmonogram przeglądów okresowych i alerty
alerts_desc = Inteligentne alerty oparte na przebiegu i czasie, chroniące Twój pojazd przed przekroczeniem terminu serwisu
alerts_filter_all = Wszystkie
alerts_filter_urgent = Pilne / Przekroczone
alerts_filter_due_soon = Zbliżające się
alerts_status_ok = Stan prawidłowy
alerts_status_due_soon = Wymagany wkrótce
alerts_status_overdue = Przekroczony termin serwisu!
alerts_interval = Interwał:
alerts_last_done = Ostatnio wykonano przy:
alerts_remaining = Pozostało:
alerts_passed = Przekroczono o:
alerts_btn_edit_baseline = Ustaw bazę serwisu
alerts_btn_mark_done = Wykonano teraz
alerts_modal_edit_title = Ustawienie ostatniego serwisu
alerts_modal_odo_label = Przebieg przy ostatniej wymianie (km)
alerts_modal_date_label = Data ostatniej wymiany
alerts_modal_interval_label = Interwał serwisowy (km)
alerts_modal_save = Zapisz
alerts_modal_cancel = Anuluj
alerts_baseline_tip = Brak wcześniejszego wpisu dla tej czynności

# OEM Manual Tab
manual_title = Specyfikacja fabryczna OEM
manual_desc = Certyfikowane dane techniczne dotyczące płynów, olejów, ciśnienia w oponach i paliwa dla
manual_btn_fetch = Pobierz dane OEM przez AI
manual_btn_refresh = Odśwież dane przez AI
manual_loading = Przeszukiwanie fabrycznych instrukcji serwisowych...
manual_loading_sub = AI weryfikuje zalecaną lepkość oleju silnikowego, pojemności układów, płyn przekładniowy, chłodzący i ciśnienia opon.
manual_card_engine_oil = Olej silnikowy i pojemność
manual_field_oil_viscosity = Zalecana lepkość i norma:
manual_field_oil_capacity = Pojemność układu (z filtrem):
manual_card_fluids = Płyny napędowe i chłodzące
manual_field_trans_fluid = Olej przekładniowy (ATF / CVT / Manual):
manual_field_coolant = Płyn chłodzący silnika:
manual_field_brake_fluid = Płyn hamulcowy (norma DOT):
manual_card_tire_pressure = Ciśnienie w oponach (na zimno)
manual_field_tire_front = Opony przednie:
manual_field_tire_rear = Opony tylne:
manual_card_fuel_ignition = Układ paliwowy i zapłonowy
manual_field_tank_capacity = Pojemność zbiornika paliwa:
manual_field_octane = Zalecana liczba oktanowa:
manual_field_spark_plugs = Świece zapłonowe:
manual_card_battery = Akumulator i instalacja elektryczna
manual_field_battery = Parametry akumulatora:
manual_card_oem_tips = Zalecenia eksploatacyjne producenta
manual_empty_title = Brak pobranych danych technicznych OEM
manual_empty_desc = Użyj AI, aby pobrać fabryczne specyfikacje olejów, płynów, ciśnienia w oponach i pojemności baku dla Twojego pojazdu.
manual_empty_btn = Pobierz dane OEM teraz
manual_not_specified = Nie określono

# AI Car Doctor Tab
doc_title = Konsultacja z doradcą technicznym AI
doc_desc = Skonsultuj się z wirtualnym mistrzem serwisu w sprawie objawów, nietypowych dźwięków, kodów błędów OBD-II lub interwałów wymian
doc_input_label = Opisz objaw, dźwięk lub kod błędu:
doc_input_placeholder = Przykład: Słyszę stukanie przy skręcie w prawo przy niskiej prędkości, co oznacza błąd P0420? Kiedy wymienić rozrząd w moim aucie?
doc_quick_title = Szybkie zapytania:
doc_quick_1 = Delikatne stukanie przy ostrych skrętach
doc_quick_2 = Drgania kierownicy podczas hamowania
doc_quick_3 = Słabe przyspieszenie i spadek mocy
doc_quick_4 = Najlepsza lepkość oleju na wysokie temperatury latem
doc_btn_submit = Zapytaj doradcę AI
doc_btn_loading = Analiza objawów i historii pojazdu...
doc_welcome_title = Jak działa doradca techniczny AI?
doc_welcome_desc = Asystent łączy Twój aktualny przebieg, historię dotychczasowych napraw oraz fabryczne biuletyny serwisowe dla Twojego modelu auta, aby dostarczyć trafną diagnozę.
doc_your_query = Twoje zapytanie:
doc_advice_title = Diagnoza i zalecenia mistrza serwisu:

# Report Tab
rep_title = Raport stanu technicznego i historii pojazdu (Dla kupującego / Właściciela)
rep_desc = Zweryfikowana i przejrzysta dokumentacja przebiegu, historii serwisowej oraz wymienionych części
rep_btn_print = Drukuj oficjalny raport / PDF
rep_btn_excel = Eksportuj pełną dokumentację do Excela (.xlsx)
rep_btn_excel_maint = Eksportuj serwis do Excela
rep_btn_excel_fuel = Eksportuj tankowania do Excela
rep_official_seal = Certyfikowany raport przeglądów i serwisu wygenerowany przez system CarBook
rep_sig_owner = Podpis właściciela pojazdu:
rep_sig_inspector = Podpis diagnosty / Pieczęć serwisu:
rep_heading = Certyfikowany raport okresowy przeglądu i obsługi pojazdu
rep_date = Data sporządzenia raportu:
rep_summary_odometer = Potwierdzony przebieg
rep_summary_oil = Zalecany olej silnikowy
rep_summary_total_maint = Łączna liczba zarejestrowanych usług
rep_table_title = Udokumentowana historia obsługi i płynów eksploatacyjnych:
rep_th_date = Data
rep_th_odometer = Przebieg
rep_th_service = Wykonana usługa
rep_th_workshop = Warsztat / Stacja
rep_th_cost = Koszt
rep_th_notes = Uwagi

# Notifications
notif_title = Powiadomienia serwisowe i alerty na urządzeniu
notif_desc = Włącz powiadomienia na telefonie lub w przeglądarce, aby otrzymywać przypomnienia o zbliżających się przeglądach
notif_status_enabled = Powiadomienia na tym urządzeniu są aktywne ✅
notif_status_disabled = Powiadomienia są wyłączone 🔕
notif_status_unsupported = Powiadomienia nie są obsługiwane przez tę przeglądarkę/urządzenie
notif_btn_enable = Włącz powiadomienia urządzenia
notif_btn_test = Wyślij powiadomienie testowe 🔔
notif_test_sent = Powiadomienie testowe wysłane pomyślnie!
notif_urgent_banner = Pilny alert serwisowy: Masz czynności serwisowe wymagane natychmiast lub przekroczone!
notif_view_alerts = Zobacz alerty

# Settings Tab
set_title = Ustawienia systemu i konfiguracja AI
set_fuel_pricing_title = Rodzaje i ceny paliwa
set_fuel_pricing_desc = Zdefiniuj rodzaje i ceny paliwa, aby automatycznie obliczać litry i koszty przy każdym nowym tankowaniu
set_fuel_add_btn = Dodaj nowy rodzaj paliwa
set_ai_title = Konfiguracja dostawcy AI
set_ai_desc = Wprowadź własny klucz API Google Gemini lub OpenRouter, aby pobierać zalecenia dotyczące oleju, harmonogramów i konsultacji AI. Klucz jest bezpiecznie przechowywany lokalnie.
set_ai_provider = Dostawca AI
set_ai_key_label = Klucz API
set_ai_key_saved = Skonfigurowany klucz:
set_ai_key_placeholder = Wprowadź nowy klucz API, aby zaktualizować...
set_save_btn = Zapisz ustawienia
set_save_success = Ustawienia zostały pomyślnie zapisane!

# Modals - Add Vehicle Modal
modal_car_add_title = Dodaj nowy pojazd
modal_car_name_label = Nazwa pojazdu (np. Moje auto codzienne / Samochód rodzinny)
modal_car_name_placeholder = Moje auto codzienne
modal_car_make = Marka
modal_car_model = Model
modal_car_year = Rok produkcji
modal_car_plate = Numer rejestracyjny (opcjonalnie)
modal_car_init_odo = Przebieg początkowy (km)
modal_car_ai_box = Sugeruj olej silnikowy i harmonogram z AI
modal_car_ai_btn = Wyszukaj i zaproponuj
modal_car_ai_loading = Wyszukiwanie...
modal_car_ai_found = Znaleziono fabryczne rekomendacje
modal_car_ai_oil = Sugerowany olej:
modal_car_ai_note = Harmonogram przeglądów zostanie automatycznie wygenerowany.
modal_car_oil_label = Zalecany olej silnikowy
modal_car_btn_save = Zapisz pojazd

# Modals - Fuel Modal
modal_fuel_new_title = Zarejestruj tankowanie
modal_fuel_edit_title = Edytuj tankowanie
modal_fuel_type_label = Rodzaj paliwa (z Ustawień)
modal_fuel_liters_label = Ilość paliwa (litry)
modal_fuel_price_label = Cena za litr
modal_fuel_total_label = Łączna zapłacona kwota
modal_fuel_full_tank_checkbox = Tankowanie do pełna (wymagane do obliczenia l/100km)
modal_fuel_notes_label = Notatki (opcjonalnie)
modal_fuel_btn_save = Zapisz tankowanie
modal_fuel_btn_update = Zaktualizuj tankowanie

# Modals - Maintenance Modal
modal_maint_new_title = Zarejestruj serwis / wymianę oleju
modal_maint_edit_title = Edytuj wpis serwisowy
modal_maint_date = Data
modal_maint_odo = Przebieg (km)
modal_maint_title_label = Zakres wykonanych prac
modal_maint_title_placeholder = np. Wymiana oleju syntetycznego 5W-30 + oryginalny filtr oleju
modal_maint_parts_box_title = Wyszczególnienie części i materiałów
modal_maint_add_part_btn = Dodaj część zamienną
modal_maint_part_name = Nazwa części
modal_maint_part_cond_new = Nowa / Oryginał OEM
modal_maint_part_cond_used = Używana / Regenerowana
modal_maint_part_price = Cena
modal_maint_parts_total_label = Łączny koszt części
modal_maint_labor_label = Koszt robocizny
modal_maint_total_label = Suma całkowita
modal_maint_workshop = Warsztat / Serwis (opcjonalnie)
modal_maint_next_odo = Docelowy przebieg następnego serwisu (opcjonalnie)
modal_maint_btn_save = Zapisz wpis
modal_maint_btn_update = Zaktualizuj wpis

# Common Actions & Dialogs
btn_cancel = Anuluj
btn_edit = Edytuj
btn_delete = Usuń
confirm_delete_fuel = Czy na pewno chcesz usunąć ten wpis tankowania?
confirm_delete_maint = Czy na pewno chcesz usunąć ten wpis serwisowy?
`;

export default plRaw;
