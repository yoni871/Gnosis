const express = require("express");
const pool = require("../db/db");
const bcrypt = require("bcrypt");
const router = express.Router();
const jwt = require("jsonwebtoken");
const authenticateToken = require("../middleware/authMiddleware");


//to register an account
router.post("/register", async (req, res) => {
    const { firstName, lastName, email, password, } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    pool.query(
        `
        INSERT INTO users(first_name, last_name, email, password_hash)
        VALUES ($1, $2, $3, $4)
        RETURNING id, first_name, last_name, email
        `,
        [firstName, lastName, email, hashedPassword],
        (error, result) => {
            if(error) {
                console.error(error);
                if(error.code === "23505") {
                    res.status(409).json({
                        error: "An account with that email already exists."
                    });
                } else {
                    res.status(500).json({
                        error: "Can not create an account."
                    })
                }   
            } else {
                res.json(result.rows[0])
            }
        }
    );
});


//to login into an exisitng account
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    pool.query(
        "SELECT * FROM users WHERE email = $1",
        [email],
        async (error, result) => {
            if(error) {
                return res.status(500).json({
                    error: "Something went wrong."
                });
            }

            if(result.rows.length === 0) {
                return res.status(401).json({
                    error:"Invalid email or password."
                })
            }

            const user = result.rows[0];
            const passwordMatch = await bcrypt.compare(password, user.password_hash);

            if(!passwordMatch) {
                return res.status(401).json({
                    error: "Invalid email or password."
                });
            }

            const token = jwt.sign(
                { userId: user.id },
                process.env.JWT_SECRET,
                { expiresIn: "7d" }
            );

            res.json({
                token: token
            });

        }
    )
});


//to get the profile of the currently logged in user
router.get("/profile", authenticateToken, (req, res) => {
    //get the id of the currently authenticated user
    const userId = req.user.userId;

    //find the user's profile in the database
    pool.query(
        `
        SELECT id, first_name, last_name, email
        FROM users
        WHERE id = $1
        `,
        [userId],
        (error, result) => {
            if(error) {
                return res.status(500).json({
                    error: "Failed to retrieve profile."
                });
            }
            //return the user's profile
            res.json(result.rows[0]);
        }
    );
});

module.exports = router;