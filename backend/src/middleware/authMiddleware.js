const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if(!authHeader) {
        return res.status(401).json({
            error: "Access token required."
        });
    }

    //extract the actual jwt from bearer <token>
    const token = authHeader.split(" ")[1];

    //verify the token was created by our server
    jwt.verify(token, process.env.JWT_SECRET, (error, user) => {
        if(error) {
            return res.status(403).json({  //403 = forbidden
                error: "Invalid or expired token."
            });
        }

        //store the verifed user info on the request
        req.user = user;
        //continue to the next middleware or route
        next();
    });
}

module.exports = authenticateToken;