export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const response = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: `data=${encodeURIComponent(req.body)}`
            }
        );

        if (!response.ok) {
            return res.status(response.status).send(
                await response.text()
            );
        }

        const data = await response.text();

        res.setHeader("Content-Type", "application/json");
        res.status(200).send(data);

    } catch (error) {
        res.status(500).json({
            error: "Overpass request failed",
            details: error.message
        });
    }
}