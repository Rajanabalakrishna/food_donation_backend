const mongoose=require("mongoose")

const userSchema= new mongoose.Schema({
    name:{
        required:true,
        type:String,
        trim:true
    },

    email:{
        required:true,
        type:String,
        trim:true,
        unique:true,
        validate:
        {
            validator:(value)=>{
                const re= /^(([^<>()[\]\.,;:\s@\"]+(\.[^<>()[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i;
                return value.match(re);
            },
            message:"Please enter a valid email address"
        },
    },

    password:
    {
        type:String,
    },

    occupation:
    {
        type:String,
        default:""
    },

    district:
    {
        type: String,
        trim:true,
        default:""

    },

    type:
    {
        type:String,
        default:"donor",
    },

    contact:
    {
        type:String,
        trim:true,
        default:""
    },

    googleId: {
        type: String,
    }

})


const User=mongoose.model("User",userSchema)

module.exports=User;