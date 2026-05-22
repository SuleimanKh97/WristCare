\# WristCare Backend



This folder contains the backend API prototype for the WristCare system.



\## Purpose



The backend simulates the server-side component of WristCare. It provides REST API endpoints for retrieving patient vital signs, checking abnormal readings, and triggering emergency SOS alerts.



\## Technologies Used



\- Node.js

\- Express.js

\- TypeScript

\- CORS

\- dotenv



\## Implemented Endpoints



\### Health Check



GET /



Returns a message confirming that the API is running.



\### Get Patient Vitals



GET /api/vitals/1



Returns all stored vital sign readings for patient 1.



\### Get Latest Vitals with Alert Status



GET /api/vitals/1/latest



Returns the latest vital sign reading and checks whether the reading is normal or abnormal.



\### SOS Test Endpoint



GET /api/vitals/sos/test



Simulates an emergency SOS alert triggered by the elderly user.



\## Current Implementation Status



This backend is a prototype. It currently uses mock data to simulate readings from a Samsung Galaxy Watch. TypeScript types are used to define the structure of vital sign readings and alert responses. Future work will include Health Connect API integration, PostgreSQL database storage, authentication, and Firebase Cloud Messaging notifications.

