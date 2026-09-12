export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const query =
            typeof req.body === "string"
                ? req.body
                : req.body?.data || "";

        if (!query) {
            return res.status(400).json({
                error: "Empty Overpass query"
            });
        }

        const response = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "User-Agent": "EdaPovva/1.0"
                },
                body: new URLSearchParams({
                    data: query
                }).toString()
            }
        );

        const text = await response.text();

        if (!response.ok) {
            return res.status(response.status).send(text);
        }

        res.setHeader("Content-Type", "application/json");
        return res.status(200).send(text);

    } catch (error) {
        return res.status(500).json({
            error: "Overpass request failed",
            details: error.message
        });
    }
}