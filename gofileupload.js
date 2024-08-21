const axios = require("axios");
const fs = require('fs');
const FormData = require('form-data')
module.exports.uploadFile = async (server, fileToUpload,filename, usertoken, folderID,)=>{
    const formData = new FormData();
formData.append("file", fileToUpload, { filename });
if(folderID) formData.append("folderId", folderID);
if(usertoken) formData.append("token", usertoken);
try{
   let {data} = await axios.post('https://'+server+'.gofile.io/contents/uploadfile',formData,{
    headers: {
        ...formData.getHeaders(),

        'Accept': 'application/json',
      },
   })
   return data
  }catch(e){
    console.log(e)
 return e.response.data
}
}

module.exports.getServer = async()=>{
try{
 let {data} = await axios.get("https://api.gofile.io/servers")
 return data
 }catch(e){
 return e.response.data
}
}

module.exports.getContent = async (contentsId, usertoken)=>{
try{
 let {data} = await axios.get('https://api.gofile.io/getContent?contentId='+contentsId+'&token='+usertoken)
 return data
   }catch(e){
 return e.response.data
}
}

module.exports.createFolder = async(parentFolderID, usertoken, folderName)=>{
try{
 let {data} = await axios({
  method: 'put',
  url: 'https://api.gofile.io/createFolder',
  data: {
   parentFolderId: parentFolderID,
   token: usertoken,
   folderName: folderName
  }
 })
 return data
  }catch(e){
 return e.response.data
}
}

module.exports.copyContent = async (contentsId, usertoken, folderIdDest)=>{
try{
 let {data} = await axios({
  method: 'put',
  url: 'https://api.gofile.io/copyContent',
  data: {
   contentsId: contentsId,
   token: usertoken,
   folderIdDest: folderIdDest
  }
 })
 return data
 }catch(e){
 return e.response.data
}
}

module.exports.setFolderOptions = async (contentsId, usertoken, folderOptions, value)=>{
try{
switch (folderOptions){
 case "public":
 switch (true){
  case value.toLowerCase().indexOf('true') !== -1 || value.toLowerCase().indexOf('yes') !== -1 || value.toLowerCase().indexOf('on') !== -1:
  value = "true";
  break;
  case value.toLowerCase().indexOf('false') !== -1 || value.toLowerCase().indexOf('no') !== -1 || value.toLowerCase().indexOf('off') !== -1:
  value = "false";
  break;
  default:
  value = "true";
 }
 break;
 case "expire":
 let unix = Math.floor(new Date(value).getTime() / 1000)
 value = unix.toString();
 break;
}
 let {data} = await axios({
  method: 'put',
  url: 'https://api.gofile.io/setFolderOption',
  data: {
   folderId: contentsId,
   token: usertoken,
   option: folderOptions,
   value: value
  }
 })
  return data
 }catch(e){
 return e.response.data
}
}

module.exports.deleteContent = async (contentsId, usertoken)=>{
try{
 let {data} = await axios({
  method: 'delete',
  url: 'https://api.gofile.io/deleteContent',
  data: {
   contentsId: contentsId,
   token: usertoken
  }
 })
 return data
 }catch(e){
 return e.response.data
}
}

module.exports.getAcountDetails = async (usertoken)=>{
try{
 let{data}  = await axios.get("https://api.gofile.io/getAccountDetails?token="+usertoken+"&allDetails=true")
 return data
}catch(e){
 return e.response.data
}
}