# khedmaPro — App Screenshots

Full visual walkthrough of every screen in the khedmaPro mobile app, plus the
public marketing website. Regenerate any time with:

```bash
sudo supervisorctl restart expo && sleep 6
python3 /app/scripts/screenshot_helper.py all
python3 /app/scripts/scroll_settings.py       # extra scrolls for admin settings
python3 /app/scripts/pricing_block.py         # pricing card on marketing site
python3 /app/scripts/scroll_marketing.py      # FR / AR marketing pages
```

All shots are taken at a 390×844 mobile viewport (iPhone 12/13 Pro size) unless
noted otherwise. Marketing website shots are at 1280×900 desktop.

---

## 01_landing_auth — Onboarding & auth
| File | What it shows |
|---|---|
| `01_landing_en.png` | Landing page in **English** with "NEW / MADE FOR ALGERIA" banner |
| `02_landing_fr.png` | Landing page in **French** |
| `03_landing_ar.png` | Landing page in **Arabic** (full RTL) |
| `04_login_phone_entry.png` | Phone number entry step (E.164 formatter for +213) |
| `05_login_email.png` | Legacy email/password sign-in |
| `06_otp_screen.png` | 6-digit OTP verification |
| `07_register_client.png` | Registration — **Client** tab |
| `08–10_register_provider*.png` | Registration — **Provider** tab (top → scrolls) |
| `11_complete_profile.png` | Profile completion after OTP login |

## 02_client — Client experience
| File | What it shows |
|---|---|
| `01_home_browse.png` | Browse home (search bar, categories, provider cards, ads) |
| `02_home_scrolled.png` – `03_home_scrolled2.png` | Provider list scroll — Bayesian ranking with NEW badges |
| `04_filters_sheet.png` | Advanced filters sheet (price slider, sort, verified/new toggles, radius/wilaya) |
| `05–08_provider_profile_*.png` | Provider detail (hero, portfolio grid, reviews with photos, CTA) |
| `09_booking_new_top.png` | Booking form top (name, phone, description) |
| `10_booking_new_map.png` | Leaflet pin-drop map with wilaya inference |
| `11_booking_new_bottom.png` | Booking type toggle (instant vs custom quote) + submit |

## 03_provider — Provider dashboard
| File | What it shows |
|---|---|
| `01_dashboard_top.png` | KPIs, trial banner, subscription state |
| `02_dashboard_analytics.png` | Impressions / conversion chart (react-native-gifted-charts) |
| `03_dashboard_portfolio.png` | Drag-to-reorder portfolio grid |
| `04_dashboard_bottom.png` | Quick actions + settings |
| `05_bookings.png` | Bookings inbox / status flow |
| `06_schedule_top.png` – `07_schedule_calendar.png` | Weekly schedule + working-hours editor |
| `08_messages_list.png` | Chat threads |
| `09_chat_conversation.png` | WebSocket chat conversation |
| `10–12_profile_*.png` | Provider profile (bio, subscription, danger zone) |

## 04_admin — Admin dashboard
| File | What it shows |
|---|---|
| `01_dashboard_kpis*.png` | KPIs — clients / providers / bookings / commission (this month + all-time) |
| `02_users.png` | User list with filter/deactivate/verify actions |
| `03_bookings.png` | Live booking monitor |
| `04_subscriptions.png` | Chargily subscription health |
| `05_categories.png` | Category CRUD (icon + EN/FR/AR labels + reorder + active toggle) |
| `06_ads.png` | In-app ad manager (image, cap, start/end date) |
| `07_verification.png` | Provider verification queue |
| `08_flags.png` | User/booking flags |
| `09_broadcast.png` | Push broadcast composer |
| `10_revenue*.png` | Revenue timeseries + wilaya breakdown |
| `11_marketing_kit*.png` | AI-generated ad photos (FR + AR), ready to copy/share |
| `12_settings*.png` | Platform settings (Chargily, SMS, social, **marketing site editor**) |

## 05_marketing_site — Public marketing website
| File | What it shows |
|---|---|
| `01_home*.png` | Home page (EN, desktop) |
| `02_for_providers*.png` | For-providers page — hero, features, pricing, CTA |
| `03_how_it_works.png` | How it works |
| `04_contact.png` | Contact form + emails/phones |
| `05_privacy.png` / `06_terms.png` | Legal |
| `07–08_home_mobile*.png` | Mobile viewport home |
| `09–17_*_fr / *_ar.png` | French + Arabic marketing pages |
| `20–22_for_providers_*_pricing_block.png` | **Pricing block** in EN / FR / AR (admin-configurable body + `/month` `/mois` `/شهر`) |

---

## Verified last-session polish items

Two polish items shipped last session are visible in the screenshots:

1. **French ad photos: "tap" → "click"**
   See `04_admin/11_marketing_kit.png` — the French Hero ad reads
   *"Des pros de confiance, en un click"*.

2. **Admin marketing-site editor: nav labels + pricing block**
   See `04_admin/12_settings_scroll7.png` for the *Navigation labels
   (all site pages)* section (How it works / For providers / Contact / Open
   app — EN + FR + AR each) and `12_settings_scroll8.png` –
   `12_settings_scroll9.png` for the pricing block editor (price amount +
   period suffix + body copy per language). The resulting front-end is in
   `05_marketing_site/20–22_for_providers_*_pricing_block.png`.

## Test credentials used for these captures
- Admin: `admin@khedmapro.dz` / `admin123`
- Provider: `provider1@khedmapro.dz` / `password123`
- Full list in `/app/memory/test_credentials.md`
