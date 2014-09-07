-- Several Queries
SELECT user_id, COUNT(user_id) FROM (

    -- Anyone wanting to learn the same language with >= fluency

    SELECT p.user_id FROM 
    user_to_language as p, 
    (SELECT user_id, language_id, fluency 
        FROM user_to_language 
        WHERE known = FALSE AND 
        user_id = $1::int) as sub 
    WHERE 
    p.known = FALSE AND
    p.language_id = sub.language_id AND
    p.fluency >= sub.fluency AND
    p.user_id != sub.user_id

    UNION ALL

    -- Inverted Abilities (good_english/bad_spanish <--> bad_english/good_spanish)
    -- TODO

    -- You know it and they want to learn it

    SELECT p.user_id FROM 
    user_to_language as p, 
    (SELECT user_id, language_id, fluency 
        FROM user_to_language 
        WHERE known = TRUE AND 
        user_id = $1::int) as sub 
    WHERE 
    p.known = FALSE AND
    p.language_id = sub.language_id AND
    p.user_id != sub.user_id
    UNION ALL

    -- You want to know it and they know it
    SELECT p.user_id FROM 
    user_to_language as p, 
    (SELECT user_id, language_id, fluency 
        FROM user_to_language 
        WHERE known = FALSE AND 
        user_id = $1::int) as sub 
    WHERE 
    p.known = TRUE AND
    p.language_id = sub.language_id AND
    p.user_id != sub.user_id

    UNION ALL

    -- You both want to learn it
    SELECT p.user_id FROM 
    user_to_language as p, 
    (SELECT user_id, language_id
        FROM user_to_language 
        WHERE known = FALSE AND 
        user_id = $1::int) as sub 
    WHERE 
    p.known = FALSE AND
    p.language_id = sub.language_id AND
    p.user_id != sub.user_id
) as t
GROUP BY user_id
ORDER BY count DESC
