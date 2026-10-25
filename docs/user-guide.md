# User guide (pilot)

A short guide to running the app day to day. Figures are **management** figures for this
device's workspace only. They are not statutory accounts, and nothing is shared between devices.

## Set up once

1. Install the app on the device (see [deployment.md](deployment.md)).
2. Create the business workspace. Check **Settings**: time zone (Africa/Accra), week start, and
   backup reminder interval.
3. Review asset and expense categories in **Settings**.
4. Add each vehicle or asset with its cost, residual value, useful life and in-service date.
   Cost is never entered as an expense; it reaches profit only through depreciation.

## Every day or after each trip

- **Revenue:** record each trip/job with its service date, reference, asset and amount. If you do
  not know the asset yet, choose _Unassigned_; it will appear under **Tasks**.
- **Expenses:** record each cost as _Direct_ (one asset), _Shared / fleet_ (overheads, never split
  across assets) or _Unassigned_. Mark purchases and improvements as _Capital_.
- **Mistakes:** use _Correct_ (every change is audited) or _Void_ with a reason. Nothing is
  deleted.

## Every week

- Clear the **Tasks** list: assign unassigned revenue, classify expenses, complete asset records.
- **Download a full backup** and keep it off the device (the reminder banner shows when one is
  due). Keep a few recent backups; they contain sensitive business information.

## Every month

1. Make sure all of last month's trips and expenses are recorded and Tasks are cleared.
2. Open **Reports** for last month. Check the fleet statement and each asset's profit.
3. On **Depreciation**, close the month once the figures are final (this cannot be undone).
4. Export CSVs if needed for others, and download a full backup.

## Reading the reports

- _Asset management profit_ = asset revenue − direct operating expenses − depreciation.
- _Fleet management profit_ also deducts shared and unassigned expenses, so it is **not** the sum
  of asset profits; the report shows how they reconcile.
- _Margin_ is shown only when revenue is above zero, otherwise N/A.
- A period that has not ended shows revenue to date but the whole period's depreciation.
- Every assumption is listed at the bottom of the Reports page.

## Moving to another device

Download a full backup, copy the file, and restore it on the other device into an **empty**
workspace. The app never merges or overwrites. See [backup-and-restore.md](backup-and-restore.md).
