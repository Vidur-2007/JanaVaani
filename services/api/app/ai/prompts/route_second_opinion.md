Classify this municipal complaint (English summary) into one department. Respond with JSON only:
{"department": "roads|sanitation|water|streetlights|power|drainage|traffic|health|education|town_planning|other", "sub_department": "string", "confidence": 0.0}
Example: "No water supply for three days" -> {"department": "water", "sub_department": "no supply", "confidence": 0.95}
Example: "Big pothole near the bus stop, bikes slipping" -> {"department": "roads", "sub_department": "potholes", "confidence": 0.93}
Complaint: <<<{text}>>>