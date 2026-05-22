

Jordan University of Science and Technology
College of Computer Sciences & Information Technology






   WristCare



A project submitted
in partial fulfillment of the requirements for the degree of
Bachelor' in Software Engineering




by

		Khaled ali adas (170582)
	Ibrahim mostafa khashashneh (154285) 
	Yazeed mowafaq alhammad (161892)
	Abdallah mohammad alrayyan(166181)




Supervised by


		
                                                 MOHAMMAD RADAIDEH





Month Year

May-2026

Undertaking



This is to declare that the project entitled “WristCare” is an original work done by undersigned, in partial fulfillment of the requirements for the degree “Bachelor in Software Engineering” at Software Engineering Department, College of Computer and Information Technology, Jordan University of Science and Technology.


All the analysis, design and system development have been accomplished by the undersigned.  Moreover, this project has not been submitted to any other college or university.














Student 1 Khaled ali adas (170582)




Student 2 Khaled ali adas (170582)




Student 3 Yazeed mowafaq alhammad (161892)


Student 4 Abdallah mohammad alrayyan(166181)






ABSTRACT
WristCare is a remote health monitoring system designed to enhance the safety and well-being of elderly individuals living alone. The system leverages the Samsung Galaxy Watch 4 to continuously monitor vital signs, including heart rate, blood oxygen levels (SpO2), and blood pressure. Collected health data is transmitted through the Samsung Health and Health Connect APIs to an Android companion application, which forwards the data to a cloud-based backend built with Node.js and PostgreSQL. The system provides real-time alerts to designated caregivers, family members, and medical personnel when abnormal readings are detected. An emergency SOS feature allows users to manually trigger alerts when needed. WristCare aims to reduce emergency response time, improve elderly care quality, and provide peace of mind to families and healthcare providers through continuous, automated health monitoring.
Acknowledgment
We would like to express our sincere gratitude to our supervisor, MOHAMMAD RADAIDEH for his continuous guidance, support, and valuable feedback throughout the development of WristCare. Their expertise and encouragement were instrumental in shaping this project.
We would also like to thank the Software Engineering Department at Jordan University of Science and Technology for providing us with the knowledge and skills necessary to undertake this project.
Finally, we extend our deepest appreciation to our families and friends for their endless patience, motivation, and support throughout our academic journey. This project would not have been possible without them.
Content

 
CHAPTER 1: Project Overview, Vision, and Planning
1.1 Problem Statement
The aging population faces a growing challenge of living independently without immediate access to medical assistance. Elderly individuals who live alone are particularly vulnerable to sudden health emergencies such as cardiac events, respiratory failures, and falls. In many cases, these emergencies go undetected for extended periods of time, significantly reducing the chances of survival and recovery.
In Jordan, as in many other countries, the traditional model of elderly care relies heavily on family presence or periodic check-ins. However, with increasingly busy lifestyles and family members living separately, continuous physical supervision is often not possible. This gap in care creates a dangerous situation where an elderly person experiencing a health crisis may be unable to call for help in time.
Current solutions in the market are either too expensive, require complex setup, or are not accessible in the Jordanian context. Dedicated medical alert systems often depend on subscription-based monitoring centers that operate primarily in Western countries, making them impractical locally. Consumer smartwatches, while affordable and widely available, lack a unified platform that connects their health data directly to family members, caregivers, and medical facilities simultaneously.
WristCare addresses this gap by providing an affordable, integrated health monitoring solution built on the Samsung Galaxy Watch 4. The system continuously tracks vital signs including heart rate, blood oxygen saturation (SpO2), and blood pressure, and automatically alerts family members and healthcare providers when abnormal readings are detected. An emergency SOS button gives the elderly user direct control to call for help when needed. By combining wearable technology with a real-time alert system, WristCare aims to improve emergency response times, reduce health risks for elderly individuals living alone, and provide families with peace of mind.
1.2 Related Products
Several existing products attempt to address elderly health monitoring, each with notable limitations that WristCare aims to overcome.
Apple Watch Series 9 / Ultra 2 offers comprehensive health tracking including heart rate, SpO2, ECG, and fall detection, along with a built-in emergency SOS feature. However, it requires a paired iPhone at all times, making it inaccessible to elderly users who do not own Apple devices. Additionally, its high price point (starting at $399) makes it impractical for widespread adoption in the Jordanian market.
Bay Alarm Medical SOS Smartwatch is purpose-built for elderly monitoring and includes heart rate tracking, fall detection, and a dedicated SOS button. However, it operates on a mandatory monthly subscription of $39.95–$49.95 and relies on a US-based monitoring center, making it functionally unusable in Jordan.
Withings ScanWatch 2 is a medically credible device with FDA clearance, offering ECG, SpO2, and 24/7 heart rate monitoring with up to 30 days of battery life. Despite its strong health tracking capabilities, it lacks a dedicated SOS button, which is a critical requirement for elderly users in emergency situations.
Garmin Venu 3 provides solid health monitoring features including heart rate, SpO2, and stress tracking, along with decent battery life. However, it does not natively support blood pressure monitoring, and its developer SDK uses Monkey C, an obscure programming language that adds unnecessary complexity for integration purposes.
WristCare differentiates itself from all of the above by combining affordability, local accessibility, and a fully custom software platform. Built on the Samsung Galaxy Watch 4, which is available in Jordan for approximately 40–70 JD used, WristCare integrates health data directly with a backend system that simultaneously notifies family members, caregivers, and hospitals in real time. Unlike subscription-based solutions, WristCare offers affordable local subscription tiers starting at 5 JD/month, significantly cheaper than international alternatives. Unlike locked ecosystems such as Apple, it works with any Android phone. This combination of accessibility, multi-stakeholder notification, and local relevance makes WristCare a uniquely suitable solution for the Jordanian elderly care context.
1.3 Product Vision
Proposed Solution
WristCare is a remote health monitoring system that uses the Samsung Galaxy Watch 4 to continuously track the vital signs of elderly individuals living alone. Health data including heart rate, blood oxygen saturation, and blood pressure is collected automatically through the Samsung Health and Health Connect APIs, forwarded to a cloud-based backend, and made available in real time to family members, caregivers, and hospital staff through a dedicated dashboard. When abnormal readings are detected or the user manually triggers the SOS button, the system immediately sends alerts to all registered contacts, enabling faster emergency response.
Target Users / Stakeholders
WristCare serves three primary groups. First, elderly individuals living alone who need continuous health monitoring without requiring technical knowledge or manual input. Second, family members and caregivers who need visibility into their loved one's health status from anywhere. Third, healthcare providers and hospitals who benefit from receiving real-time alerts and patient health history, allowing them to respond more effectively to emergencies.
Product Vision Statement
"WristCare helps elderly individuals living alone stay safe by continuously monitoring their vital signs and instantly alerting their family members and healthcare providers when intervention is needed."
Value Proposition
WristCare is innovative because it bridges the gap between consumer wearable technology and practical elderly care in the Jordanian context. It transforms an affordable, widely available smartwatch into a medical-grade monitoring tool through an accessible subscription model starting at 5 JD per month  a fraction of the cost of international alternatives. The multi-stakeholder notification system  reaching family, caregivers, and hospitals simultaneously  is a key differentiator that no single existing product currently offers in an integrated, locally accessible package. The tiered subscription model ensures long-term sustainability while keeping the service affordable for Jordanian families.
Scope
WristCare includes continuous vital sign monitoring, real-time multi-stakeholder alerts, an emergency SOS feature, a caregiver and hospital web dashboard, health history tracking, and a tiered subscription system with three plans. The Free plan supports one family contact and seven days of health history. The Basic plan at 5 JD per month supports three contacts, hospital alerts, and thirty days of history. The Premium plan at 10 JD per month supports unlimited contacts, SOS priority alerts, full health history, and weekly health reports. The system does not include direct integration with Jordan's 911 emergency services, on-device AI diagnostics, or support for non-Android devices in its initial version.
Related Products
Unlike Apple Watch, WristCare does not require an iPhone. Unlike Bay Alarm Medical, which charges $40 per month and operates only in the United States, WristCare offers locally relevant plans starting at 5 JD per month with full support for the Jordanian market. Unlike Withings ScanWatch 2, it includes a dedicated SOS button. Unlike Garmin Venu 3, it supports blood pressure monitoring and uses a widely known development stack. WristCare combines the strengths of these products while eliminating their key limitations within the local context.

1.4 Project Objectives and Milestones
Project Objectives
WristCare aims to achieve the following measurable objectives:
Integrate the Samsung Galaxy Watch 4 with the Health Connect API to collect real-time vital signs including heart rate, blood oxygen saturation, and blood pressure.
Develop an Android companion application that reads health data and transmits it securely to a cloud-based backend.
Build a Node.js backend with a PostgreSQL database capable of storing patient vitals and triggering threshold-based alerts.
Implement a multi-stakeholder notification system that simultaneously alerts family members, caregivers, and hospital staff upon detecting abnormal readings.
Provide an emergency SOS feature allowing elderly users to manually trigger alerts with a single button press.
Develop a web dashboard for caregivers and hospital staff to monitor patient vitals and view health history.
Implement a tiered subscription system with Free, Basic, and Premium plans.
Deliver a fully tested, documented, and deployable system by the end of Project 2.
1.5 Risk Assessment and Mitigation


CHAPTER 2: Product Features and Requirements
2.1 Functional Features

The following table presents the major functional features of WristCare, organized by priority and implementation stage:

1 - Elderly use case




























2 – family member use case



















3 – Hospital staff use case




















3 – System use case





2.2 Feature-to-Requirement Mapping


CHAPTER 3: System Design and Deployment Overview
3.1 System Architecture




WristCare follows a layered architecture consisting of five main layers. The Wearable Layer handles data collection through the Samsung Galaxy Watch 4, syncing vitals automatically through Samsung Health and the Health Connect API. The Presentation Layer consists of an Android mobile app for family members and a React.js web dashboard for hospital staff. The Business Logic Layer is built on a Node.js REST API that handles authentication, threshold-based alert detection, and subscription management. The Notification Layer uses Firebase FCM for real-time push notifications and an email service for weekly reports. The Data Layer uses PostgreSQL for persistent storage of all vitals and user data.
3.2 Detailed Design (UML Models Based on Implementation)
Class Diagram
Sequence Diagrams 










2-


























3-






















State Machine Diagram
1-


2-

3-

3.3 Software Deployment

CHAPTER 4: System Development and Implementation

Purpose:
Summarize the implemented and partially implemented components of the system. Demonstrate how these components represent the foundation of the final product, not a throwaway prototype. Expected length: 2 – 3 pages
✅ Tip: Focus on a few core features that demonstrate key functionality and technical feasibility. Your prototype doesn’t need to be complete — it must prove that your concept and architecture are viable.
4.1 Core Implementation Progress
Students should:
Provide a short paragraph summarizing what has been developed so far.
Provide the GitHub repository link(s) to their project code. Example GitHub Repository: https://github.com/username/project-name
Ensure each feature or module has an associated README file or inline documentation.
4.2 Implemented and Planned Features
Each implemented feature should be traced back to the functional requirements in the requirement chapter. Use a traceability table to demonstrate alignment.



✅ Tip: Each implemented feature should correspond to a tested use case.

4.3 Screenshots Evidence
Screenshots should demonstrate the actual functionality developed during GP1 and must directly relate to the features listed in Section 5.1. Only working parts of the system should be shown—mockups or disconnected UI designs are not acceptable. [2-3 key screenshots]
CHAPTER 5: Testing
Purpose: Demonstrate how the system was verified and validated to ensure that implemented features meet requirements. Expected length: 1.5 – 2 pages

Note: Your testing should cover Implemented Features in GP1 but must cover all features in GP2.
5.1 Testing Overview
Students should:
Describe the purpose of testing in this phase.
Identify what types of testing were performed: unit, integration, or UI testing.
Explain the test scope (which modules or features were covered).
List the tools and frameworks used during testing. For example:
5.2 Sample Test Cases
Provide at least 5–10 representative test cases covering implemented features.
 Each case must include input, expected output, and a link or reference to code or evidence.
5.3 Test reports
Students should attach or link to:
Test result files (logs, screenshots, CI/CD reports, or unit test output).
Screenshots of API test results or execution traces.
References
List all frameworks, APIs, libraries, and research papers used.

Milestone ID | Milestone Description | Start Date | End Date | Deliverable
     M1 | Problem analysis and literature review | Week 1 | Week 2 | Problem Statement, Related products sections
M2 | Requirements gathering and use case definition | Week 2 | Week 3 | Functional & Non-functional Requirements
      M3 | System architecture | Week 3 | Week 4 | Architecture diagram
M4 | Database design and ER diagram | Week 4 | Week 5 | ER Diagram, DB Schema
      M5 | UI/UX wireframes and prototype | Week 5 | Week 6 | Figma prototype
M6 | UML diagrams (Use Case, Sequence, Class) | Week 6 | Week 7 | UML diagram
      M7 | GP1 report writing and submission | Week 7 | Week 8 | Final GP1 Report
GP2 |  |  |  |   
      M8 | Backend development (API + Database) | Week 1 | Week 4 | Working on Node.js API + PostgreSQL DB
M9 | Android companion app development | Week 3 | Week 8 | Android app with Health Connect integration
     M10 |     Web              dashboard             development | Week 5 | Week 10 | Family and hospital dashboard
M11 | Notification and alert system | Week 9 | Week 11 | Firebase FCM alerts + SOS feature
     M12 | Subscription system implementation | Week 10 | Week 12 | subscription module
M13 | System integration and testing | Week 12 |  Week 15 | Test cases and bug fixes
     M14 | Final report and presentation | Week 15 | Week 16 | Final GP2 Report + Demo


Risk ID | Description | Impact | Mitigation Strategy
  R1 | Difficulty integrating Samsung Health Connect API due to limited documentation and platform restrictions |      High | Allocate extra research time early in GP2, test API connectivity in Week 1, seek supervisor guidance if blocked
  R2 | Samsung Galaxy Watch 4 hardware malfunction or unavailability during development |      High | Purchase the watch early, keep a backup plan of using Samsung Health app data exports for testing
R3 | Team members unfamiliar with Kotlin and Wear OS development |   High | Begin Kotlin learning during GP1, use official Android codelabs and assign the most experienced developer to the Android app
  R4 | Data privacy and security concerns around transmitting sensitive health data |      High | Implement JWT authentication, encrypt data in transit using HTTPS, follow basic GDPR-inspired data handling practices
   R5 | Web dashboard not rendering correctly on older browsers used in hospitals |      low | Use widely supported React libraries, test on Chrome and Firefox, avoid bleeding-edge CSS features


Feature ID | Feature Name | Description | Priority (H/M/L) | Implementation Stage
F1 | User Authentication | Allow elderly users, family members, and hospital staff to register and log in securely using email and password | High | Project 1
F2 | Vital Signs Monitoring | Continuously collect heart rate, blood oxygen saturation (SpO2), and blood pressure from the Samsung Galaxy Watch 4 via Health Connect API | High | Project 2
  F3 |   Real-Time Alert System |   Automatically send alerts to registered contacts when vital signs exceed predefined thresholds |   High |   Project 2
F4 | Emergency SOS | Allow the elderly user to manually trigger an emergency alert to all registered contacts with a single button press on the watch | High | Project 2
F5 | Family Dashboard | Provide family members with a mobile view of their loved one's real-time vitals and alert history | High | Project 2
F6 | Hospital Dashboard | Provide hospital staff with a web-based view to monitor multiple patients simultaneously and manage alert logs | High | Project 2
 F7 |  Health History Tracking | Store and display historical vital sign data with charts and trends over time | Medium | Project 2
F8 | Contact Management | Allow users to register and manage emergency contacts including family members and hospital personnel | Medium | Project 2
F9 | Subscription Management | Allow users to select, upgrade, or downgrade between Free, Basic, and Premium subscription plans | Medium | Project 2
F10 | Push Notifications | Deliver real-time push notifications to family members and caregivers via Firebase FCM when alerts are triggered | High | Project 2
F11 | Patient Profile Management | Allow administrators and family members to create and manage elderly patient profiles including medical notes | Medium | Project 2
F12 | Weekly Health Reports | Automatically generate and send weekly health summary reports to registered contacts on the Premium plan | High | Project 2


Feature ID | Requirement ID | Requirement Description | Priority
F1 | FR-1 | The system shall allow users to register using an email and password. | High
F1 | FR-2 | The system shall verify user credentials before granting access. | High
F1 | FR-3 | The system shall support three user roles: Elderly User, Family Member, and Hospital Staff | High
F1 | NFR-1 | All passwords must be encrypted using bcrypt hashing | High
F1 | NFR-2 | The system shall use JWT tokens for session management with a 24-hour expiry | High
F2 | FR-4 | The system shall collect heart rate readings from the Samsung Galaxy Watch 4 via Health Connect API | High
F2 | FR-5 | The system shall collect SpO2 readings continuously and transmit them to the backend | High
F2 | FR-6 | The system shall collect blood pressure readings and store them with a timestamp | High
F2 | NFR-3 | The system shall operate continuously in the background without requiring manual user input | High
F3 | FR-7 | The system shall define threshold values for heart rate, SpO2, and blood pressure per patient | High
F3 | FR-8 | The system shall automatically trigger an alert when a vital sign exceeds its defined threshold | High
F3 | FR-9 | The system shall notify all registered contacts simultaneously when an alert is triggered | High
F3 | NFR-5 | Alerts must be delivered to registered contacts within 15 seconds of threshold detection | High
F4 | NFR-6 | The SOS alert must be delivered within 10 seconds of button activation | High
F5 | FR-12 | The Android app shall display the elderly user's current heart rate, SpO2, and blood pressure in real time | High
F5 | FR-13 | The app shall display a history of triggered alerts with timestamps | High
F5 | NFR-7 | The family dashboard must refresh vital signs data every 30 seconds or less | Medium
F6 | FR-14 | The web dashboard shall display all registered patients and their current vital signs | Medium
F6 | FR-15 | Hospital staff shall be able to view detailed health history for each patient | Medium
F6 | NFR-8 | The web dashboard must load patient data within 3 seconds of login | Medium
F7 | FR-16 | The system shall store all vital sign readings with timestamps in the database | Medium
F7 | FR-17 | The system shall display historical vitals in a chart format filterable by day, week, and month | Medium
F7 | NFR-9 | Health history data must be retained for a minimum of 30 days on the Basic plan and indefinitely on the Premium plan | Medium
F8 | FR-18 | The system shall allow users to add, edit, and remove emergency contacts | Medium
 F8 |  FR-19 |  Each patient profile shall support a minimum of one contact on the Free plan and unlimited contacts on the Premium plan |  Medium
F9 | FR-20 | The system shall present three subscription plans: Free, Basic (5 JD/month), and Premium (10 JD/month) | Medium
F9 | FR-21 | The system shall restrict features based on the user's active subscription plan | Medium
F10 | FR-22 | The system shall send push notifications to family members via Firebase FCM when an alert is triggered | High
F10 | NFR-11 | Push notifications must be delivered even when the mobile application is running in the background | High
F11 | FR-23 | The system shall allow creation of elderly patient profiles including name, age, medical notes, and assigned contacts | Medium
F11 | FR-24 | Only authorized family members or hospital staff shall be able to edit a patient profile | Medium
F12 | FR-25 | The system shall automatically generate a weekly health summary report for Premium plan users | Low
F12 | FR-26 | Weekly reports shall be delivered to registered contacts via email every Monday | Low
F12 | NFR-12 | Weekly reports must be generated and sent within 5 minutes of the scheduled time | Low


Component | Technology | Purpose
Wearable | Samsung Galaxy Watch 4 | Collects vitals data
Data Bridge | Health Connect API | Health Connect API
Mobile App | Kotlin (Android) | Family-facing vitals and alerts
WebDashboard | React.js | Hospital staff patient monitoring
Backend | Node.js + Express.js | REST API and business logic
Database | PostgreSQL | Stores vitals, users and alerts
Authentication | Authentication | Secure user session management
Notifications | Firebase FCM | Push alerts to family members
Version Control | GitHub | Team collaboration and code management


Feature ID | Feature Name | Related Requirement | Implementation Status | GitHub Link
F1 | Generate Report | FR-01 | Implemented | [Link]
F2 | User Login | FR-02 | Implemented | [Link]
F3 | Chat Groups | FR-03 | Partial | [Link]
F4 | Admin Dashboard | FR-06 | To-be-implemented-GP2 | -
… |  |  |  | 


Tool / Framework | Purpose
Junit | Unit testing for Java backend
Postman | API testing
Selenium | UI testing for web prototype
PyTest | Functional testing for Python scripts


Test Case ID | Feature | Input | Expected Output | Actual Output | Result | Evidence / Link
TC-01 | Login | Valid credentials | Redirect to dashboard | Dashboard loads | Pass | [Github Link]
TC-02 | Report Generation | Valid date range | Report generated | Report generated | Pass | [Github Link]
TC-03 | Chat Group Creation | Empty group name | Error message | Error shown | Pass | [Screenshot]
