# Towncart Stock And Delivery

Build a mobile-first wholesale ordering website, similar to Blinkit/Amazon, for a wholesale business in a small town in India. Use Supabase for the database and login.

Customer side:

1. Home page: search bar, product categories, and a grid of product cards. Each card shows image, name, unit (e.g. kg, packet, box), price in ₹, and an "Add" button with quantity +/- controls. Show "Out of stock" if unavailable.

2. Sign up: name (required), phone number (required, 10 digits), password (required), email (optional), delivery address/location (required). Login with phone number + password. Do not use SMS/OTP verification.

3. Cart: list items, change quantities, show total in ₹.

4. Checkout: confirm delivery address (editable), optional note, and a "Place Order" button. Payment is cash on delivery or UPI at delivery, so no online payment.

5. My Orders page: list past orders with status (Received, Confirmed, Dispatched, Delivered, Cancelled).

Database tables in Supabase: products, categories, customers, orders, order_items. Products must be readable by everyone, even logged-out visitors. Customers can only see their own orders.

Use a clean, simple design with a green and white colour scheme. Add 10 sample products so I can see how it looks. Do not build the admin panel yet.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://towncart-stock-and-delivery.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ba3289df-b9ec-4c4c-bb2f-43cf9d8747e2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
